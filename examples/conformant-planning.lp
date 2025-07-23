%%% Tab: instance.lp
action(cpa_start(cpa_n1)).
action(cpa_start(cpa_n2)).
action(cpa_travel(cpa_n1,cpa_n1)).
action(cpa_travel(cpa_n1,cpa_n2)).
action(cpa_travel(cpa_n2,cpa_n1)).
action(cpa_travel(cpa_n2,cpa_n2)).
fluent(cpa_started).
fluent(cpa_visited(cpa_n1)).
fluent(cpa_visited(cpa_n2)).
fluent(cpa_at(cpa_n1)).
fluent(cpa_at(cpa_n2)).
executable(cpa_travel(cpa_n1,cpa_n1),lit(cpa_started,1)).
executable(cpa_travel(cpa_n1,cpa_n2),lit(cpa_started,1)).
executable(cpa_travel(cpa_n2,cpa_n1),lit(cpa_started,1)).
executable(cpa_travel(cpa_n2,cpa_n2),lit(cpa_started,1)).
effect(cpa_start(cpa_n1),lit(cpa_started,1),1).
effect(cpa_start(cpa_n1),lit(cpa_visited(cpa_n1),1),1).
effect(cpa_start(cpa_n2),lit(cpa_started,1),1).
effect(cpa_start(cpa_n2),lit(cpa_visited(cpa_n2),1),1).
effect(cpa_travel(cpa_n1,cpa_n2),lit(cpa_visited(cpa_n2),1),1).
effect(cpa_travel(cpa_n1,cpa_n2),lit(cpa_at(cpa_n2),1),1).
effect(cpa_travel(cpa_n1,cpa_n2),lit(cpa_at(cpa_n1),-1),1).
effect(cpa_travel(cpa_n2,cpa_n1),lit(cpa_visited(cpa_n1),1),1).
effect(cpa_travel(cpa_n2,cpa_n1),lit(cpa_at(cpa_n1),1),1).
effect(cpa_travel(cpa_n2,cpa_n1),lit(cpa_at(cpa_n2),-1),1).
condition(cpa_start(cpa_n1),lit(cpa_at(cpa_n1),1),1).
condition(cpa_start(cpa_n2),lit(cpa_at(cpa_n2),1),1).
condition(cpa_travel(cpa_n1,cpa_n2),lit(cpa_at(cpa_n1),1),1).
condition(cpa_travel(cpa_n2,cpa_n1),lit(cpa_at(cpa_n2),1),1).
initially(lit(cpa_visited(cpa_n1),-1)).
initially(lit(cpa_visited(cpa_n2),-1)).
initially(lit(cpa_started,-1)).
initially_oneof(1,lit(cpa_at(cpa_n1),1),1).
initially_oneof(1,lit(cpa_at(cpa_n2),1),2).
goal(lit(cpa_visited(cpa_n1),1)).
goal(lit(cpa_visited(cpa_n2),1)).
holds_initially(cpa_at(cpa_n2)).

%%% Tab: encoding.lp
#include <incmode>.

#program base.

lit(lit(F, 1)) :- fluent(F).
lit(lit(F,-1)) :- fluent(F).

complement(F,lit(F,1),lit(F,-1)) :- fluent(F).
complement(L,M;M,L) :- complement(F,L,M).

fluent((L;M),F) :- complement(F,L,M).

contradict(F) :- complement(F,L,M), effect(A,L,N1), effect(A,M,N2),
                 #false: condition(A,M,N1), condition(A,L,N2), complement(L,M).

holds(F,0) :- holds_initially(F).

#program step(t).

1 { occurs(A,t): action(A) } 1.
 :- occurs(A,t), executable(A,L), not holds(F,t-1), complement(F,L,M).
 :- occurs(A,t), executable(A,M),     holds(F,t-1), complement(F,L,M).

holds(L,t) :- occurs(A,t), effect(A,L,N), holds(C,t-1): condition(A,C,N).
holds(L,t) :- holds(L,t-1), complement(L,M), not holds(M,t).
 :- contradict(F), complement(F,L,M), holds((L;M),t).

caused(L,t) :- occurs(A,t), effect(A,L,N),
               not holds(F',t-1): condition(A,M',N), complement(F',L',M');
                   holds(F',t-1): condition(A,L',N), complement(F',L',M').
holds(F,t) :- caused(L,t), complement(F,L,M).
holds(F,t) :- holds(F,t-1), complement(F,L,M), not caused(M,t).
 :- caused((L;M),t), contradict(F), complement(F,L,M).

#program check(t).

% candidate

 :- goal_or(N,*);
    not holds(F,t): goal_or(N,L), complement(F,L,M);
        holds(F,t): goal_or(N,M), complement(F,L,M);
    query(t).
 :- goal(L), not holds(F,t), complement(F,L,M), query(t).
 :- goal(M),     holds(F,t), complement(F,L,M), query(t).

% verification

%% base

alt_holds(L,0,t); alt_holds(M,0,t) :- query(t), complement(F,L,M),
                                      not initially(L), not initially(M).
alt_holds(L,0,t) :- query(t), initially(L).

pos_holds_oneof(N,B,t) :- query(t), initially_oneof(N,*,B),
                          alt_holds(L,0,t): initially_oneof(N,L,B).
not_holds_oneof(N,B,t) :- query(t), initially_oneof(N,L,B),
                          complement(L,M), alt_holds(M,0,t).

bottom(t) :- query(t), initially_oneof(N,*,*),
             2 { pos_holds_oneof(N,B,t): initially_oneof(N,*,B) }.
bottom(t) :- query(t), initially_oneof(N,*,*),
             not_holds_oneof(N,B,t): initially_oneof(N,*,B).
bottom(t) :- query(t), alt_holds(L,0,t), initially_oneof(N,L,B),
             not_holds_oneof(N,B,t).

%% trans

not_condition(A,N,T,t) :- query(t), complement(C,D),
                          condition(A,C,N), alt_holds(D,T-1,t).
not_caused(L,T,t)      :- query(t), occurs(A,T), lit(L),
                          not_condition(A,N,T,t): effect(A,L,N).

alt_holds(L,T,t) :- query(t), occurs(A,T), effect(A,L,N),
                    alt_holds(C,T-1,t): condition(A,C,N).
alt_holds(L,T,t) :- query(t), complement(L,M), 
                    alt_holds(L,T-1,t), not_caused(M,T,t).

%% check

not_contradict(F,T,t) :- query(t), contradict(F), fluent(L,F),
                         not_caused(L,T,t).
pos_executable(T,t)   :- query(t), occurs(A,T),
                         alt_holds(C,T-1,t): executable(A,C), C != true.
pos_goal_or(N,t) :- goal_or(N,L), alt_holds(L,t,t), query(t).
pos_goal_or(N,t) :- goal_or(N,L), goal(L), query(t).

bottom(t) :- query(t),
             pos_goal_or(N,t)     : goal_or(N,*);
             alt_holds(L,t,t)     : goal(L);
             pos_executable(R,t)  : R = 1..t;
             not_contradict(F,S,t): contradict(F), S = 1..t.

%% saturation

alt_holds((L;M),0,t) :- query(t), bottom(t), complement(F,L,M),
                        not initially(L), not initially(M).

:- not bottom(t), query(t).

% suppress warnings about optional facts in instance
#defined goal_or/2.

% output
#show occurs/2.
