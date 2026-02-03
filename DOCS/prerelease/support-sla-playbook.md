# Support SLA Playbook (Design 7)

Triage and escalation procedures for CuePoint support.

## Priority Classifications

| Priority | Description | Response Target |
| --- | --- | --- |
| **P0** | Crash, data loss, security | 24 hours |
| **P1** | Major functionality broken | 48 hours |
| **P2** | Minor issue, workaround exists | 5 days |

## Triage Workflow

1. **Intake**: User reports via GitHub Issues or in-app Report Issue.
2. **Categorize**: Assign priority (P0/P1/P2) and category (crash, update, matching, performance, UI).
3. **Request bundle**: If not attached, ask for Support Bundle (Help > Export Support Bundle).
4. **Reproduce**: Use run ID and diagnostics to reproduce; check logs for errors.
5. **Resolve or escalate**: Fix, document workaround, or escalate to maintainers.

## Categories

- **Crash**: Unhandled exception, app exits. Check crash logs in `crashes/`.
- **Update failure**: Auto-update fails. Verify appcast, signatures, network.
- **Matching quality**: Wrong or missing matches. Check query generation, scoring.
- **Performance**: Slow runs, high memory. Check performance report, concurrency.
- **UI issue**: Layout, responsiveness, accessibility.

## Support Bundle Review Checklist

- [ ] Verify run ID in diagnostics.json
- [ ] Check logs for ERROR/CRITICAL
- [ ] Check crash file if crash reported
- [ ] Verify config (sanitized) for anomalies
- [ ] Note OS and app version

## Escalation

- **P0**: Notify maintainers immediately; consider hotfix release.
- **P1**: Add to sprint; target next patch.
- **P2**: Backlog; address when capacity allows.

## Runbook: Crash Spike

1. Identify affected version from issues.
2. Disable auto-update for that version if needed.
3. Profile and fix root cause.
4. Release hotfix.
5. Re-enable update.

## Runbook: Update Failure

1. Check appcast URL and format.
2. Verify signatures (macOS notarization, Windows code signing).
3. Re-publish if artifact corrupted.
4. Document in release notes.

## Runbook: Log Loss

1. Ask user to re-run with `--debug` (CLI) or enable verbose logging.
2. Request fresh support bundle.
3. Check log path permissions.
