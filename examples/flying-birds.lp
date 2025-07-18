%%% Tab: instance.lp
eagle(eddy).
penguin(tux).

%%% Tab: encoding.lp
 fly(X) :- bird(X), not -fly(X).
-fly(X) :- penguin(X).
bird(X) :- penguin(X).
bird(X) :- eagle(X).
