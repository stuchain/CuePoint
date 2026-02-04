# Incident Response Runbook

Design: Step 13 Post-Launch Operations and Support.

## Purpose

This runbook guides response to incidents (critical bugs, crashes, update failures). Follow these steps to identify impact, communicate, and mitigate.

## Incident Severity

| Severity | Definition | Response | Resolution |
| --- | --- | --- | --- |
| **Sev1** | Data loss, widespread crash, security | 2 hours | 24 hours |
| **Sev2** | Major feature broken | 24 hours | 7 days |
| **Sev3** | Minor, limited impact | 5 days | Backlog |

## Incident Timeline Template

```
[Time] - Incident detected
[Time] - Triage started
[Time] - Owner assigned
[Time] - Mitigation applied
[Time] - Resolution
```

## Response Steps

### 1. Confirm Incident

- Verify the issue is real and reproducible
- Assess scope: how many users affected?
- Assign severity (Sev1/Sev2/Sev3)

### 2. Assign Owner

- Sev1: Assign maintainer immediately
- Sev2: Assign support lead or maintainer
- Sev3: Add to backlog

### 3. Communicate

- **Initial notice** (within 2h for Sev1): Post in release notes or GitHub
- Use template: "We are aware of an issue affecting [X]. We are investigating and will update shortly."
- Update users as findings emerge

### 4. Mitigate

- **Crash spike**: Disable auto-update for affected version; profile and fix
- **Update failure**: Check appcast, signatures; re-publish if corrupted
- **Data loss**: Document workaround; release hotfix ASAP

### 5. Resolve

- Implement fix
- Test thoroughly
- Release hotfix or patch
- Update appcast

### 6. Postmortem (Sev1 Required)

- Complete [Postmortem Template](#postmortem-template) within 1 week
- Document root cause, action items
- Share learnings with team

## Incident Template

```
Incident ID: INC-YYYYMMDD-N
Date/Time: [ISO timestamp]
Severity: Sev1 / Sev2 / Sev3
Summary: [One-line description]
Impact: [What is broken]
Users affected: [Estimate or "unknown"]
Detection: [How was it detected]
Root cause: [When known]
Mitigation: [What was done]
Resolution: [Fix version]
Action items: [List]
```

## Postmortem Template

```
## What happened
[Brief description]

## Why it happened
[Root cause analysis]

## What went well
[Positive aspects of response]

## What went poorly
[Areas for improvement]

## Action items
- [ ] [Action 1]
- [ ] [Action 2]
```

## Rollback Criteria

Consider rollback when:
- Crash spike (>2% of users)
- Update failure (clients cannot update)
- Data loss or corruption
- Security vulnerability

See [Rollback Runbook](rollback.md).

## Related Documents

- [Triage Workflow](triage-workflow.md)
- [Rollback](rollback.md)
- [Update Feed Recovery](update-feed-recovery-runbook.md)
- [Support SLA Playbook](../prerelease/support-sla-playbook.md)
