# Support Triage Workflow

## Overview

This document defines the triage workflow for support issues, including priority classifications, SLA targets, and escalation paths.

## Triage Categories

| Category | Description | Examples |
| --- | --- | --- |
| **Crash** | Unhandled exception, app exits unexpectedly | Uncaught exception, segfault |
| **Update failure** | Auto-update fails | Appcast invalid, signature failure |
| **Matching quality** | Wrong or missing matches | Incorrect Beatport match, no matches |
| **Performance** | Slow runs, high memory | Timeout, stalls, OOM |
| **UI** | Layout, responsiveness, accessibility | Button not visible, wrong layout |

## Severity Levels

| Severity | Definition | Response Target | Resolution Target |
| --- | --- | --- | --- |
| **P0** | Crash, data loss, security vulnerability | 24 hours | 24 hours (hotfix) |
| **P1** | Core feature broken, no workaround | 48 hours | 7 days |
| **P2** | Minor issue, workaround exists | 5 business days | Backlog |

## Incident Severity (Ops)

| Severity | Definition | Response | Resolution |
| --- | --- | --- | --- |
| **Sev1** | Critical – data loss, widespread crash | 2 hours | 24 hours |
| **Sev2** | Major – core feature broken | 24 hours | 7 days |
| **Sev3** | Minor – limited impact | 5 days | Backlog |

## Triage Workflow Steps

### 1. Intake

- User reports via GitHub Issues or in-app Report Issue
- Issue is created with template (bug, feature, security, support question)

### 2. Assign Severity

- Review description and assign P0/P1/P2 (or Sev1/Sev2/Sev3 for incidents)
- Apply severity label: `priority:P0`, `priority:P1`, `priority:P2`

### 3. Assign Category

- Apply category label: `crash`, `update`, `matching`, `performance`, `ui`

### 4. Request Support Bundle (if applicable)

- For crashes or complex issues: request support bundle via comment
- "Please attach a support bundle: Help → Export Support Bundle (or `--export-support-bundle` from CLI)"

### 5. Assign Owner

- Assign maintainer or support lead for P0/P1
- P2 may remain unassigned until backlog grooming

### 6. Reproduce

- Use run ID and diagnostics to reproduce
- Check logs for ERROR/CRITICAL
- Verify config in support bundle for anomalies

### 7. Resolve or Escalate

- **Fix**: Implement fix, document in changelog
- **Workaround**: Document in known issues, add to FAQ
- **Escalate**: P0 → notify maintainers; create hotfix plan

## Support Workflow Checklist

- [ ] Issue labeled
- [ ] Severity assigned
- [ ] Owner assigned (for P0/P1)
- [ ] Support bundle requested (if crash/complex)
- [ ] Run ID captured (if applicable)
- [ ] Logs reviewed
- [ ] Fix verified

## Escalation Path

| Issue | Escalate To | Action |
| --- | --- | --- |
| P0 / Sev1 | Maintainer | Immediately; hotfix plan |
| P1 / Sev2 | Support lead | Assign to sprint |
| P2 / Sev3 | Backlog | Groom when capacity |

## Escalation Checklist (P0)

- [ ] Notify maintainer
- [ ] Create hotfix plan
- [ ] Assess impact (users affected)
- [ ] Communicate to users (if widespread)

## Support Response Templates

### Thanks for the report

```
Thanks for reporting this issue. We've assigned it [P0/P1/P2] severity. 

For faster resolution, please attach a support bundle if you haven't already:
- GUI: Help → Support & Diagnostics → Export Support Bundle
- CLI: cuepoint --export-support-bundle

We'll update as we investigate.
```

### Request support bundle

```
To help diagnose this issue, could you please attach a support bundle?

1. Help → Support & Diagnostics → Export Support Bundle (GUI)
2. Or run: cuepoint --export-support-bundle (CLI)

The bundle contains anonymized logs and diagnostics. No personal data is included.
```

### Resolution summary

```
**Resolution:** [Brief summary]
**Fix version:** [Version number]
**Workaround:** [If applicable]
```

## Support Metrics

- **Time to first response (TTFR)**: Target < 24h for P0, < 48h for P1
- **Time to resolution (TTR)**: Target < 7 days for P1
- **P0 resolution**: Target within 24h (hotfix)

## Related Documents

- [Release Deployment Runbook](release-deployment-runbook.md)
- [Incident Response Runbook](incident-response-runbook.md)
- [Support SLA Playbook](../security/support-sla-playbook.md)
- [Ops Index](ops-index.md)
