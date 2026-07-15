# Milestone 1 — tracking (hybrid start)

GitHub issues were not created automatically (`gh` not authenticated). Create these manually or run `gh auth login` then:

```bash
gh issue create --title "UI overhaul: Qt Results table parity (Rollout Phase B)" --body-file docs/ui-overhaul/tracking/issue-qt-results.md
gh issue create --title "UI overhaul: Spike S1 engine health + Electron shell" --body-file docs/ui-overhaul/tracking/issue-spike-s1.md
gh issue create --title "UI overhaul: inKey + inCrate parity matrix" --body-file docs/ui-overhaul/tracking/issue-parity-matrix.md
```

## Workstreams

| ID | Title | Status |
| --- | --- | --- |
| WS-1 | [Qt Results table parity](issue-qt-results.md) | Done |
| WS-2 | [Spike S1 engine + Electron shell](issue-spike-s1.md) | Done |
| WS-3 | [inKey + inCrate parity matrix](issue-parity-matrix.md) | Done |

## Milestone gate

When all three are done:

- Start **Rollout Phase A** (Qt settings scroll/layout)
- Start **Phase 3** engine API sketch (progress, results endpoints)

See [rollout-phases.md](../rollout-phases.md) and [phase-3-engine-api.md](../phase-3-engine-api.md).
