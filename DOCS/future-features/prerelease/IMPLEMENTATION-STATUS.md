# Prerelease implementation status

Audit of `docs/future-features/prerelease/release-readiness.md` against the codebase. **Not 100%** — several items are implemented but were unchecked; a number remain unimplemented.

---

## Summary

| Category | Unchecked in doc | Actually implemented | Still not done |
|----------|------------------|----------------------|----------------|
| 1) Product readiness | 6 | 4 | 2 |
| 2) Release engineering | 12 | 4 | 8 |
| 3) Quality and testing | 10 | 0 | 10 |
| 4) Security and privacy | 10 | 1 | 9 |
| 5) Reliability | 9 | 4 | 5 |
| 6) Performance | 0 | — | 0 |
| 7–15 | 0 | — | 0 |

**Implemented but were unchecked (now fixed in release-readiness.md):**

- **§1:** Support policy (docs/user-guide/support-policy.md, compatibility-matrix); first-run onboarding (OnboardingService, OnboardingDialog); guided validation/preflight (run_preflight, PreflightDialog); preflight checks (XML, playlist, config, network); “what changed” (summary report, diff report, run summary dialog); user glossary (docs/user-guide/glossary.md).
- **§2:** Release workflows automated (release.yml, release-gates.yml); deterministic build (pip --require-hashes in release-gates); build provenance (build_info.json); rollback plan (docs/release/rollback.md); release gate for version sync + changelog (R001, R002 in release-gates.yml); SBOM (generate_sbom.py, R003); reproducible build guidance (docs/release/guides/reproducible-builds.md); license bundle (R004, generate_licenses.py).
- **§4:** Vulnerability reporting path (.github/SECURITY.md, security-response-process.md, vulnerability-patch.md; disclosure policy lives in .github rather than docs/security/).
- **§5:** Defensive XML limits (MAX_XML_SIZE_BYTES, validation); crash-safe output (atomic write temp + rename in output_writer, export_service, checkpoint_service); circuit breaker (CircuitBreaker, get_network_circuit_breaker); resumable processing (checkpoint_service, --resume); log rotation (RotatingFileHandler in logger, logging_service).

**Still not implemented (left unchecked):**

- **§1:** (None remaining after audit.)
- **§2:** Notarization/stapling doc for macOS; automated release notes from merged PRs; installer verification tests (signature, checksum, size); uninstall validation per platform; artifact naming conventions; certificate/key handling procedures for CI.
- **§3:** Property-based tests; offline Beatport HTML fixtures; stress tests for large XML; fuzzing; contract tests for Beatport parsing; compatibility tests for multiple Rekordbox versions; tests for update rollback/interrupted update.
- **§4:** Sandboxing/least-privilege guidance; data retention doc for logs/caches/exports; secret scanning; integrity checks for cached data; privacy impact assessment checklist; data deletion policy doc; threat modeling for update/download; in-app privacy page (Privacy dialog exists but may not cover all listed points); third-party license bundle in release artifacts (R004 generates file; attaching to release may vary).
- **§5:** Pause-and-resume (resume exists; explicit “pause” may not); partial results preserved on crash (checkpoints help; not fully verified); configurable per-run timeouts/fail-fast (some timeouts exist); all writes outside install dirs (doc/verification); separate crash logs (crash log dir exists; “rotation” for crash logs may differ from main log).

---

## How to use

- **release-readiness.md** has been updated so every item that is implemented is marked `[x]`.
- This file is the single place to see what is still missing for “100%” relative to the prerelease checklist.
- Re-run this audit after implementing more items, or delete this file once the checklist is fully implemented.
