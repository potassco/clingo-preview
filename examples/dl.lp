%%% Tab: instance.lp
            machine(1).      machine(2).
task(a). duration(a,1,3). duration(a,2,4).
task(b). duration(b,1,1). duration(b,2,6).
task(c). duration(c,1,5). duration(c,2,5).
%%% Tab: dl.py
#script(python)
"""
This is a scaled down version of clingo-dl show casing how to implement a
propagator for difference logic.
"""

import gc
import heapq
import sys
from itertools import filterfalse
from typing import List, MutableMapping, Optional, Sequence, Set, Tuple

from clingo import ast
from clingo.base import TheoryTerm, TheoryTermType
from clingo.control import Control, ControlMode
from clingo.core import Library
from clingo.propagate import Assignment, PropagateControl, PropagateInit, Propagator
from clingo.solve import Model
from clingo.symbol import Function, Number, Symbol, SymbolType, Tuple_

Node = Symbol  # pylint: disable=invalid-name
Weight = int
Level = int
Edge = Tuple[Node, Node]
WeightedEdge = Tuple[Node, Node, Weight]
MapNodeWeight = MutableMapping[Node, Weight]

THEORY = """
#theory dl{
    diff_term {
    -  : 3, unary;
    ** : 2, binary, right;
    *  : 1, binary, left;
    /  : 1, binary, left;
    \\ : 1, binary, left;
    +  : 0, binary, left;
    -  : 0, binary, left
    };
    &diff/0: diff_term, {<=}, diff_term, head
}.
"""

_BOP = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
    "**": lambda a, b: a**b,
    "\\": lambda a, b: a % b,
    "/": lambda a, b: a // b,
}


def _evaluate(lib: Library, term: TheoryTerm) -> Symbol:
    """
    Evaluates the operators in a theory term in the same fashion as clingo
    evaluates its arithmetic functions.
    """
    # tuples
    if term.type == TheoryTermType.Tuple:
        return Tuple_(lib, [_evaluate(lib, x) for x in term.arguments])

    # functions and arithmetic operations
    if term.type == TheoryTermType.Function:
        # binary operations
        if term.name in _BOP and len(term.arguments) == 2:
            term_a = _evaluate(lib, term.arguments[0])
            term_b = _evaluate(lib, term.arguments[1])

            if term_a.type != SymbolType.Number or term_b.type != SymbolType.Number:
                raise RuntimeError("Invalid Binary Operation")

            if term.name in ("/", "\\") and term_b.number == 0:
                raise RuntimeError("Division by Zero")

            return Number(lib, _BOP[term.name](term_a.number, term_b.number))

        # unary operations
        if term.name == "-" and len(term.arguments) == 1:
            term_a = _evaluate(lib, term.arguments[0])

            if term_a.type == SymbolType.Number:
                return Number(lib, -term_a.number)

            if term_a.type == SymbolType.Function and term_a.name:
                return Function(lib, term_a.name, term_a.arguments, term_a.is_negative)

            raise RuntimeError("Invalid Unary Operation")

        # functions
        return Function(lib, term.name, [_evaluate(lib, x) for x in term.arguments])

    # constants
    if term.type == TheoryTermType.Symbol:
        return Function(lib, term.name)

    # numbers
    if term.type == TheoryTermType.Number:
        return Number(lib, term.number)

    raise RuntimeError("Invalid Syntax")


class Graph:
    # pylint: disable=too-many-instance-attributes
    """
    This class captures a graph with weighted edges that can be extended
    incrementally.

    Adding an edge triggers a cycle check that will report negative cycles.
    """

    _lib: Library
    _potential: MapNodeWeight
    _graph: MutableMapping[Node, MapNodeWeight]
    _gamma: MapNodeWeight
    _last_edges: MutableMapping[Node, WeightedEdge]
    _previous_edge: MutableMapping[Level, MutableMapping[Edge, Weight]]
    _previous_potential: MutableMapping[Level, MapNodeWeight]
    _changed: Set[Node]
    _min_gamma: List[Tuple[Weight, Node]]

    def __init__(self, lib: Library):
        self._lib = lib
        self._potential = {}  # {node: potential}
        self._graph = {}  # {node: {node : weight}}
        self._gamma = {}  # {node: gamma}
        self._last_edges = {}  # {node: edge}
        self._previous_edge = {}  # {level: {(node, node): weight}}
        self._previous_potential = {}  # {level: {node: potential}}
        self._changed = set()  # {node}
        self._min_gamma = []  # [(weight, node)]

    @staticmethod
    def _set(level, key, val, previous, get_current):
        p = previous.setdefault(level, {})
        c, k = get_current(key)
        if key not in p:
            p[key] = c[k] if k in c else None
        c[k] = val

    @staticmethod
    def _reset(level, previous, get_current):
        if level in previous:
            for key, val in previous[level].items():
                c, k = get_current(key)
                if val is None:
                    del c[k]
                else:
                    c[k] = val
            del previous[level]

    def _reset_edge(self, level: Level):
        self._reset(
            level, self._previous_edge, lambda key: (self._graph[key[0]], key[1])
        )

    def _reset_potential(self, level: Level):
        self._reset(level, self._previous_potential, lambda key: (self._potential, key))

    def _set_edge(self, level: Level, key: Edge, val: Weight):
        self._set(
            level,
            key,
            val,
            self._previous_edge,
            lambda key: (self._graph[key[0]], key[1]),
        )

    def _set_potential(self, level: Level, key: Node, val: Weight):
        self._set(
            level,
            key,
            val,
            self._previous_potential,
            lambda key: (self._potential, key),
        )

    def _pop_changed(self):
        """
        Advance to the next node that needs processing.
        """
        while self._min_gamma and self._min_gamma[0][1] in self._changed:
            heapq.heappop(self._min_gamma)
        return bool(self._min_gamma)

    def _init_check(self, level: Level, u: Node, v: Node, d: Weight):
        """
        Initialize the potentials and gammas of of nodes `u` and `v`.
        """
        if u not in self._potential:
            self._set_potential(level, u, 0)
        if v not in self._potential:
            self._set_potential(level, v, 0)
        self._gamma[u] = 0
        self._gamma[v] = self._potential[u] + d - self._potential[v]
        self._graph.setdefault(u, {})
        self._graph.setdefault(v, {})

        # enqueue v if its potential became negative
        if self._gamma[v] < 0:
            heapq.heappush(self._min_gamma, (self._gamma[v], v))
            self._last_edges[v] = (u, v, d)

    def _extract_cycle(
        self, level: Level, u: Node, v: Node, d: Weight
    ) -> Optional[List[WeightedEdge]]:
        """
        Check if there is a negative cycle.
        """
        # reset gammas
        has_cycle = self._gamma[u] < 0
        self._gamma[v] = 0
        while self._min_gamma:
            _, s = heapq.heappop(self._min_gamma)
            self._gamma[s] = 0
        self._changed.clear()

        # extract cycle
        if has_cycle:
            cycle = []
            x, y, c = self._last_edges[v]
            cycle.append((x, y, c))
            while v != x:
                x, y, c = self._last_edges[x]
                cycle.append((x, y, c))
            return cycle

        # add edge that did not introduce a cycle
        self._set_edge(level, (u, v), d)
        return None

    def add_edge(
        self, level: Level, edge: WeightedEdge
    ) -> Optional[List[WeightedEdge]]:
        """
        Add an edge to the graph and return a negative cycle (if there is one).
        """
        u, v, d = edge
        # prune redundant edges
        if u in self._graph and v in self._graph[u] and self._graph[u][v] <= d:
            return None

        self._init_check(level, u, v, d)

        # propagate negative potential changes
        while self._pop_changed() and self._gamma[u] == 0:
            _, s = heapq.heappop(self._min_gamma)
            self._set_potential(level, s, self._potential[s] + self._gamma[s])
            self._gamma[s] = 0
            self._changed.add(s)
            for t in filterfalse(self._changed.__contains__, self._graph[s]):
                gamma_t = self._potential[s] + self._graph[s][t] - self._potential[t]
                if gamma_t < self._gamma[t]:
                    self._gamma[t] = gamma_t
                    heapq.heappush(self._min_gamma, (gamma_t, t))
                    self._last_edges[t] = (s, t, self._graph[s][t])

        return self._extract_cycle(level, u, v, d)

    def get_assignment(self) -> List[Tuple[Node, Weight]]:
        """
        Get the current assignment to integer variables.
        """
        zero = Number(self._lib, 0)
        adjust = self._potential[zero] if zero in self._potential else 0
        return [
            (node, adjust - potential)
            for node, potential in self._potential.items()
            if node != zero
        ]

    def backtrack(self, level):
        """
        Backtrack the given level.
        """
        self._reset_edge(level)
        self._reset_potential(level)


class DLPropagator(Propagator):
    """
    A propagator for difference constraints.
    """

    _lib: Library
    _l2e: MutableMapping[int, List[WeightedEdge]]
    _e2l: MutableMapping[WeightedEdge, List[int]]
    _states: List[Graph]

    def __init__(self, lib: Library):
        super().__init__()
        self._lib = lib
        self._l2e = {}  # {literal: [(node, node, weight)]}
        self._e2l = {}  # {(node, node, weight): [literal]}
        self._states = []  # [Graph]

    def _add_edge(self, init: PropagateInit, lit: int, u: Node, v: Node, w: Weight):
        edge = (u, v, w)
        self._l2e.setdefault(lit, []).append(edge)
        self._e2l.setdefault(edge, []).append(lit)
        init.add_watch(lit)

    def init(self, assignment: Assignment, init: PropagateInit):
        """
        Initialize the propagator extracting difference constraints from the
        theory data.
        """
        for atom in init.base.theory:
            term = atom.name
            if term.name == "diff" and len(term.arguments) == 0:
                assert atom.guard is not None
                u = _evaluate(self._lib, atom.elements[0].tuple[0].arguments[0])
                v = _evaluate(self._lib, atom.elements[0].tuple[0].arguments[1])
                w = _evaluate(self._lib, atom.guard[1]).number
                lit = init.solver_literal(atom.literal)
                self._add_edge(init, lit, u, v, w)

    def propagate(self, assignment: Assignment, control: PropagateControl, changes: Sequence[int]):
        """
        Add edges that became true to the graph to check for negative cycles.
        """
        state = self._state(assignment.thread_id)
        level = assignment.decision_level
        for lit in changes:
            for edge in self._l2e[lit]:
                cycle = state.add_edge(level, edge)
                if cycle is not None:
                    c = [self._literal(assignment, e) for e in cycle]
                    if control.add_nogood(c):
                        control.propagate()
                    return

    def undo(self, assignment: Assignment, changes: Sequence[int]):
        """
        Backtrack the last decision level propagated.
        """
        assert changes
        self._state(assignment.thread_id).backtrack(assignment.decision_level)

    def on_model(self, model: Model):
        """
        This function should be called when a model has been found to extend it
        with the integer variable assignments.
        """
        assignment = self._state(model.thread_id).get_assignment()
        model.extend(
            [
                Function(self._lib, "dl", [var, Number(self._lib, value)])
                for var, value in assignment
            ]
        )

    def _state(self, thread_id: int) -> Graph:
        while len(self._states) <= thread_id:
            self._states.append(Graph(self._lib))
        return self._states[thread_id]

    def _literal(self, assignment, edge):
        for lit in self._e2l[edge]:
            if assignment.is_true(lit):
                return lit
        raise RuntimeError("must not happen")

def main(lib, control):
    control.parse_string(THEORY)
    # hand over control to main in parse/rewrite mode
    if control.mode in (ControlMode.Parse, ControlMode.Rewrite):
        control.main()
        return
    propagator = DLPropagator(lib)
    control.register_propagator(propagator)
    minimize = control.const_map.get("minimize")
    # proceed with normal solving if no variable is to be minimized
    if minimize is None:
        control.ground(control.parts)
        with control.solve(on_model=propagator.on_model) as hnd:
            hnd.get()
        return
    # minimize the given variable
    control.ground(control.parts)
    control.parse_string("#program __bound(b, v). &diff { v-0 } <= b.")
    bound = None
    def on_model(model: Model):
        nonlocal bound
        propagator.on_model(model)
        for symbol in model.symbols(theory=True):
            if symbol.match("dl", 2):
                n, v = symbol.arguments
                if n == minimize:
                    bound = v.number
                    return False
    while True:
        with control.solve(on_model=on_model) as hnd:
            if not hnd.get().satisfiable:
                break
        if bound is None:
            break
        print(f"Found new bound: {bound}")
        num = Number(lib, bound - 1)
        control.ground([("__bound", [num, minimize])])

    if bound is not None:
        print("Optimum found")
#end.
%%% Tab: encoding.lp
#const minimize=bound.

1 { cycle(T,U) : task(U), U != T } 1 :- task(T).
1 { cycle(T,U) : task(T), U != T } 1 :- task(U).

reach(M) :- M = #min { T : task(T) }.
reach(U) :- reach(T), cycle(T,U).
:- task(T), not reach(T).

1 { start(T) : task(T) } 1.

permutation(T,U) :- cycle(T,U), not start(U).

seq((T,M),(T,M+1),D) :- task(T), duration(T,M,D), machine(M+1).
seq((T1,M),(T2,M),D) :- permutation(T1,T2), duration(T1,M,D).

&diff { T1-T2 } <= -D :- seq(T1,T2,D).
&diff { 0-(T,M) } <= 0 :- duration(T,M,D).
&diff { (T,M)-bound } <= -D :- duration(T,M,D).

#show permutation/2.
