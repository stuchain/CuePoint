# Regression: ISSUE-EXAMPLE

Design 3.17, 3.18. Template regression case keyed by issue ID.

## Bug

Example: "CSV missing column when track has empty artist."

## Fix

Example: Output writer now emits empty string for missing artist.

## Fixtures

- `input.xml`: Rekordbox XML that triggered the bug.
- `expected_main.csv`: Expected main CSV output (or snapshot) after fix.

## How to run

From project root, run the pipeline with `input.xml` and the playlist in it, then compare output to `expected_main.csv` (e.g. diff or schema check). Regression tests can load this folder and assert output matches.
