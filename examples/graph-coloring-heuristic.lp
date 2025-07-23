%%% Tab: instance.lp
% Nodes
node(1..6).
% (Directed) Edges
edge(1,(2;3;4)).  edge(2,(4;5;6)).  edge(3,(1;4;5)).
edge(4,(1;2)).    edge(5,(3;4;6)).  edge(6,(2;3;5)).
%%% Tab: heuristic.py
#script(python)
"""
Heuristic propagator for graph coloring using Clingo's Python API.

Defines a custom propagator that prioritizes coloring vertices with the highest degree.
"""

from typing import Sequence

from clingo.control import Control
from clingo.core import Library
from clingo.propagate import Assignment, PropagateControl, PropagateInit, Propagator


class State:
    """
    Maintains per-thread state for vertex degrees during propagation.
    """

    def __init__(self):
        self.degree = {}


class ColoringHeuristic(Propagator):
    """
    Custom propagator implementing a greedy graph coloring heuristic.

    Vertices with higher degree are prioritized for coloring decisions.
    """

    def __init__(self):
        super().__init__()

        self.graph = {}
        self.color = {}
        self.states = {}

    def init(self, assignment: Assignment, init: PropagateInit):
        """
        Initializes the propagator state, builds the graph and color mappings.

        Args:
            assignment: The initial assignment object.
            init: PropagateInit object for solver initialization.
        """
        assert assignment is not None
        self.states = [State() for _ in range(init.number_of_threads)]
        for base in init.base.values():
            for symbol, atom in base.items():
                if symbol.match("edge", 2):
                    u = symbol.arguments[0]
                    v = symbol.arguments[1]
                    self.graph.setdefault(u, []).append(v)
                    self.graph.setdefault(v, []).append(u)
                    for state in self.states:
                        state.degree.setdefault(u, 0)
                        state.degree.setdefault(v, 0)
                        state.degree[u] += 1
                        state.degree[v] += 1
                elif symbol.match("color", 2):
                    u = symbol.arguments[0]
                    l = init.solver_literal(atom.literal)
                    init.add_watch(l)
                    self.color.setdefault(l, []).append(u)

    def propagate(
        self, assignment: Assignment, control: PropagateControl, changes: Sequence[int]
    ):
        """
        Updates vertex degrees after a coloring decision is propagated.

        Args:
            assignment: The current assignment object.
            control: PropagateControl object for propagation.
            changes: Sequence of literals whose assignments have changed.
        """
        assert control is not None
        state = self.states[assignment.thread_id]
        for l in changes:
            for u in self.color[l]:
                for v in self.graph[u]:
                    state.degree[v] -= 1

    def undo(self, assignment: Assignment, changes: Sequence[int]):
        """
        Restores vertex degrees when a coloring decision is undone.

        Args:
            assignment: The current assignment object.
            changes: Sequence of literals whose assignments have changed.
        """
        state = self.states[assignment.thread_id]
        for l in changes:
            for u in self.color[l]:
                for v in self.graph[u]:
                    state.degree[v] += 1

    def decide(self, assignment: Assignment, fallback: int):
        """
        Selects the next literal to assign based on the highest vertex degree.

        Args:
            assignment: The current assignment object.
            fallback: The fallback literal if no decision can be made.

        Returns:
            The literal to assign next, or the fallack if no suitable literal is found.
        """
        # in practice this implementation is unusable because it is too inefficient
        # a heap should be used to extract the vertices with maximum degree
        state = self.states[assignment.thread_id]
        decision, degree = fallback, 0
        for l, vertices in self.color.items():
            for u in vertices:
                if assignment.value(l) is None and degree < state.degree[u]:
                    decision, degree = l, state.degree[u]
        return decision


def main(lib: Library, prg: Control):
    """
    Registers the ColoringHeuristic propagator and runs the Clingo main loop.

    Args:
        lib: Clingo library object (unused).
        prg: Clingo control object.
    """
    assert lib is not None
    prg.register_propagator(ColoringHeuristic())
    prg.main()
#end.
%%% Tab: encoding.lp
#const n = 3.

% Generate
{ color(X,1..n) } = 1 :- node(X).
% Test
:- edge(X,Y), color(X,C), color(Y,C).

% Display
#show color/2.
