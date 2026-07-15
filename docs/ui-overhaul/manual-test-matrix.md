# Manual test matrix (template) — three OSes

Use this template during **parity** verification ([phase-6-gui-parity.md](phase-6-gui-parity.md)). Copy per **release candidate**.

| Date | RC version | Tester | OS version |
|------|------------|--------|------------|

## Environment

- [ ] Fresh install OR upgrade from previous release (circle one)
- [ ] Engine health reachable (if visible in dev tools)

## Core flows

| Case | Windows | macOS | Linux | Notes |
|------|---------|-------|-------|-------|
| First launch / onboarding | ☐ | ☐ | ☐ | |
| Tool selection | ☐ | ☐ | ☐ | |
| Match workflow | ☐ | ☐ | ☐ | |
| Results / history | ☐ | ☐ | ☐ | |
| Export | ☐ | ☐ | ☐ | |
| Settings | ☐ | ☐ | ☐ | |
| Beatport token flow | ☐ | ☐ | ☐ | |
| Updates check | ☐ | ☐ | ☐ | |
| Support bundle export | ☐ | ☐ | ☐ | |

## inCrate

| Case | Windows | macOS | Linux | Notes |
|------|---------|-------|-------|-------|
| Inventory | ☐ | ☐ | ☐ | |
| Discover | ☐ | ☐ | ☐ | |
| Playlist build | ☐ | ☐ | ☐ | |

## Sign-off

| Role | Name | Date |
|------|------|------|
| Tester | | |

Reference: [phase-8-testing.md](phase-8-testing.md).

## Analytical use

- Each **cell** is binary: pass/fail; **Notes** capture **defect IDs**.
- **RC sign-off** requires **all P0 journeys** checked on **all three** OS rows (or documented waiver with ADR).
- Attach **build digest** (SHA-256) for the binary under test in the **Notes** column of the header row.
