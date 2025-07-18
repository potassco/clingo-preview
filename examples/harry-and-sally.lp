%%% Tab: instance.lp
motive(harry;sally).
guilty(harry).
%%% Tab: encoding.lp
innocent(Suspect) :- motive(Suspect), not guilty(Suspect).
