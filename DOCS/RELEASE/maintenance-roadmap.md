# Maintenance Roadmap — CuePoint

**Step 15: Long-Term Maintenance and Evolution**  
**Version 1.0 — 2026-02-04**  
**Last updated**: 2026-02-04

## Overview

This roadmap tracks planned refactors, upgrades, and maintenance work. It is reviewed quarterly and updated before each major release.

## Current Quarter Focus

| Item | Priority | Status | Target |
| --- | --- | --- | --- |
| Step 15 implementation | P0 | Done | 2026-02 |
| Dependency audit in CI | P0 | Done | 2026-02 |
| Maintenance policy documentation | P0 | Done | 2026-02 |

## Refactor Backlog

| Item | Impact | Effort | Notes |
| --- | --- | --- | --- |
| (None currently) | — | — | Add items from quarterly tech-debt review |

## Upgrade Backlog

| Item | Type | Target | Notes |
| --- | --- | --- | --- |
| Python 3.12 full support | Compatibility | v1.2 | Add to CI matrix when stable |
| Rekordbox 7.x full support | Compatibility | v1.1 | XML v2 schema; experimental today |

## Deprecation Schedule

See [Deprecation Schedule](../POLICY/deprecation-schedule.md) for config keys and CLI flags.

## Tech Debt Items

Track in GitHub issues with label `tech-debt`. Prioritize by:

- **P0**: Blocking stability or security.
- **P1**: High impact, moderate effort.
- **P2**: Backlog; evaluated quarterly.

## Review Cadence

- **Quarterly**: Update this roadmap; reprioritize backlog.
- **Annual**: Long-term planning; architecture review.
- **Pre-release**: Confirm target versions.

## Related Documents

- [Maintenance Policy](maintenance-policy.md)
- [Roadmap](../roadmap.md)
- [Deprecation Schedule](../POLICY/deprecation-schedule.md)
