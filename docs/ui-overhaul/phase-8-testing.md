# Phase 8 — Testing strategy

## Purpose

Define **tests** for the new stack: **Python engine** unit/integration tests, **API contract** tests, **Electron** smoke tests, and **manual** matrices for **three OSes**—aligned with [phase-6-gui-parity.md](phase-6-gui-parity.md).

**Prerequisites:** Phase 3 (OpenAPI), Phase 5 (client).

---

## Test case ID convention

| Pattern | Owner |
|---------|--------|
| `TC-API-###` | Engine HTTP / WebSocket |
| `TC-UI-###` | Playwright or component tests |
| `TC-MAN-###` | Manual matrix rows |

**Traceability:** `TC-*` SHOULD reference Phase 6 IDs (e.g. `TC-UI-014` → `P-DLG-EXPORT`).

---

## Coverage targets (starting points — tune in ADR)

| Layer | Target | Rationale |
|-------|--------|-----------|
| HTTP handlers | **≥ 90%** branch coverage on auth + errors | High risk |
| Services (unchanged) | Maintain existing project bar | Regression |
| E2E smoke | **1** path per **epic** E1–E3 minimum | Cost control |

---

## Flakiness and quarantine policy

| Condition | Action |
|-----------|--------|
| Flaky E2E | Open issue; **quarantine** test with `skip` + link |
| Contract drift | **Block** merge until OpenAPI or server updated |

---

## Goals vs non-goals

| Goals | Non-goals |
|--------|-----------|
| Contract tests for `/v1` | 100% Playwright coverage day one |
| Smoke: app opens + health | Visual pixel diff CI for all screens |

---

## Test pyramid

| Layer | Scope |
|-------|--------|
| **Unit** | Python services unchanged; new HTTP handlers |
| **Contract** | OpenAPI examples vs engine |
| **Integration** | Engine + temp dirs + mocked Beatport |
| **E2E smoke** | Electron launches, one user path |
| **Manual** | Parity matrix (Phase 6) per OS |

---

## Alternatives considered

| E2E tool | Pros | Cons |
|----------|------|------|
| Playwright | Solid | Heavy setup |
| Spectron (deprecated) | — | Avoid |

---

## Measurable acceptance criteria

- [ ] **CI** runs **Python tests** on every PR (existing + new handler tests).
- [ ] **Contract** job validates OpenAPI vs running engine (optional nightly).

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 8.1 | Add Phase 8 doc | `docs(ui-overhaul): add phase 8 testing strategy` | |
| 8.2 | Add pytest for HTTP handlers (future) | `test(engine): add tests for engine http api` | |
| 8.3 | Add Playwright smoke (future) | `test(electron): add smoke test for app launch` | |
| 8.4 | Add manual test matrix template | `docs(ui-overhaul): add manual test matrix for three oses` | See [manual-test-matrix.md](manual-test-matrix.md) |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added test ID convention, coverage targets, flakiness policy | — |
