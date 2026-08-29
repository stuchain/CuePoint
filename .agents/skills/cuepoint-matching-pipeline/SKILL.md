---
name: cuepoint-matching-pipeline
description: Diagnose or change CuePoint queries, mix parsing, Beatport/Rekordbox parsing, candidate scoring, and match regressions. Use for wrong matches, missing metadata, parser breakage, guards, and matching rules; not unrelated UI or release work.
---

# CuePoint matching pipeline

Preserve matching accuracy, explainability, deterministic behavior, and safe input/output handling.

## Trace the actual path

Read only the branch involved in the issue:

1. Rekordbox input: `src/cuepoint/data/rekordbox.py` and shared track models.
2. Query generation: `src/cuepoint/core/query_generator.py`.
3. Search and parsing: `src/cuepoint/data/beatport_search.py`, `beatport.py`, and
   `src/cuepoint/services/beatport_service.py`.
4. Scoring and guards: `src/cuepoint/core/text_processing.py`, `mix_parser.py`, `matcher.py`,
   and `src/cuepoint/services/matcher_service.py`.
5. Orchestration/output: `processor_service.py`, `output_writer.py`, and result models.

Use `docs/development/match-rules-and-scoring.md` or `beatport-parsing.md` for intent, but confirm
thresholds, field names, and behavior in current code and tests before changing them.

## Work from a reproducible case

- Reduce a reported mismatch to input title, artists, mix/version, and the relevant candidates.
- Add or update a focused fixture for HTML/XML parser behavior.
- For a bug, write a regression assertion that fails for the observed behavior before changing
  the implementation when practical.
- Mock network access in automated tests. Do not make live Beatport availability a test
  prerequisite unless the user explicitly requests a live diagnostic.

## Preserve matching invariants

- Query ordering and deduplication must be deterministic.
- Prefer structured Beatport data and retain tested fallbacks when markup changes.
- Normalize for comparison without corrupting original display/export values.
- A scoring improvement must not silently bypass artist, title-token, or mix guards.
- Preserve candidate/rejection details, confidence labels, and audit fields so users can review
  why a match was selected or rejected.
- Do not tune a global threshold for one example without checking adjacent and negative cases.
- Treat Rekordbox collections and audio tags as user data; preserve validation, backups, and
  non-destructive failure behavior.

## Verify

Run focused tests directly with pytest because `scripts/run_tests.py` does not accept `-k`:

```bash
python -m pytest src/tests/unit/core/ -q
python -m pytest src/tests/unit/data/test_beatport.py src/tests/unit/data/test_beatport_search.py -q
python -m pytest src/tests/unit/data/test_rekordbox.py -q
python -m pytest src/tests/unit/services/test_matcher_service.py src/tests/unit/services/test_processor_service.py -q
python -m pytest src/tests/integration/test_pipeline_small_xml.py -q
```

Select only the relevant commands first. Broaden to
`python scripts/run_tests.py --unit --no-slow`, then integration tests when scoring, parsing,
serialization, or orchestration behavior crosses modules.

Report the exact reproduced case, the rule or parser branch changed, and the focused regression
coverage added.
