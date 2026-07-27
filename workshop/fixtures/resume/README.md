# Resume Fixture

1. Run lesson 3 with `--phases analyze --run-id lesson3`.
2. Run it again with `--phases plan --run-id lesson3`.
3. Confirm the guarded copy and Git history are reused.
4. Confirm `status.json` adds the completed phase.
5. Confirm `report.md` says that the source was not copied again.

The second run must add one commit. It must not repeat the first phase.
