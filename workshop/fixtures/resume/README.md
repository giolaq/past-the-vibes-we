# Resume Fixture

Run lesson 3's port with `--phases analyze --run-id lesson3`, then run it again with `--phases plan --run-id lesson3`. The guarded copy and its Git history are reused, `status.json` accumulates `phasesComplete`, and `report.md` records that the source was not copied again. You are done when the second run adds one commit on top of the first without repeating it.
