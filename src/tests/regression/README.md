# Regression tests

A regression test pins a **specific bug that actually happened**, so it cannot
come back unnoticed. That is a different job from the unit tests next door,
which describe how a component is supposed to behave.

AGENTS.md asks for "a regression test for bugs". This is where those live and
what one should look like.

## When to add one here

Add a test in this directory when a bug:

- reached a state where a user could hit it, and
- would be easy to reintroduce — a subtle condition, an ordering assumption, a
  platform difference, a value that has to survive a round trip.

A bug caught by an existing unit test needs a fix, not a new file. A bug that is
purely local to one function is usually best pinned by a unit test beside that
function; put it here when reproducing it needs a fixture, a pipeline run, or
more than one component.

Several bugs found while building the v1 foundation were pinned exactly this
way, next to the code rather than here, because a single unit test reproduced
them precisely:

- `engine/jobs.py` returning `BeatportCandidate` objects the results endpoint
  could not serialize — `tests/unit/engine/test_job_result_serialization.py`
- migrations losing their DDL because `executescript` commits implicitly —
  `tests/unit/services/test_migration_runner.py`
- config set through `ConfigService` never reaching the matching engine —
  `tests/unit/services/test_config_reaches_matcher.py`

Either location is fine. What matters is that the test fails on the old code.

## Layout

One directory per issue holding its fixtures, and one test module named after
it:

```text
src/tests/regression/
  ISSUE-EXAMPLE/            # fixtures: input.xml, expected output, README.md
  test_regression_issue_example.py
```

Name the directory after the issue or a short slug for the bug, so a future
reader can trace the test back to what happened.

## Writing one

1. **Reproduce first.** Write the test and watch it fail against the unfixed
   code. A regression test that has never failed is not evidence of anything —
   it may be asserting the wrong thing entirely, and you will not find out.
2. **Assert the symptom the user saw**, not the shape of the fix. "The results
   endpoint returns valid JSON" survives a refactor; "this helper returns a
   dict" does not.
3. **Say what broke** in the docstring: the behaviour, the cause, and what makes
   it easy to reintroduce. The next person to touch that code reads this to
   decide whether their change is safe.
4. **Keep fixtures small** and committed alongside the test. Trim a large
   Rekordbox export down to the few tracks that actually trigger the bug.

## Running them

```bash
python -m pytest src/tests/regression/ -q
python scripts/run_tests.py --all --no-slow   # includes this directory
```
