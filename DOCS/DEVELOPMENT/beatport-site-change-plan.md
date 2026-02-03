# Beatport Site Change Response Plan

Step 12: Future-Proofing - Plan for handling Beatport site changes (parsing or access).

## Overview

Beatport may change their website structure, API endpoints, or access patterns. This document outlines how to respond when parsing or search breaks.

## Detection

1. **Integration test failures**: CI runs Beatport parsing tests with fixtures. Failures may indicate HTML/API changes.
2. **User reports**: Users may report "0 candidates" or parsing errors.
3. **Monitoring**: Log provider failures (Design 12.77); track success rate per provider.

## Response Steps

### 1. Triage

- Confirm the issue is Beatport-related (not network, config, or Rekordbox).
- Check if the Beatport website structure has changed (inspect HTML, API responses).

### 2. Update Parsing Logic

- **Location**: `SRC/cuepoint/data/beatport.py` (parse_track_page), `SRC/cuepoint/data/beatport_search.py`
- **Strategy**: The code uses multiple fallbacks (JSON-LD, __NEXT_DATA__, HTML scraping). Update the relevant parser.
- **Testing**: Add/update fixtures in `SRC/tests/fixtures/` with new HTML samples.
- **Self-healing**: Design 5.11 - stale cache invalidation when empty result from cache.

### 3. Provider Abstraction (Step 12)

- If Beatport changes are severe, consider adding a fallback provider.
- Use `providers.active` config or `--provider` flag to switch.
- Provider registry: `SRC/cuepoint/data/providers.py`.

### 4. Communication

- Document the change in release notes.
- If a workaround exists, document in `DOCS/user-guide/troubleshooting.md`.
- Consider deprecation notice if a provider becomes unreliable (Design 12.82).

## Prevention

- **Fixtures**: Keep sample HTML/JSON in tests to catch regressions.
- **Contract tests**: Provider contract tests (Step 12) ensure search returns list, parse returns required fields.
- **Adapter layer**: Provider abstraction isolates parsing changes to the Beatport adapter.

## Contacts

- Provider owner: Engineering
- Schema owner: Engineering
