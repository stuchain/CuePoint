# Incident Response Runbook

## Purpose

This runbook guides response to incidents (critical bugs, crashes, broken installers). Follow these steps to identify impact, communicate, and mitigate. For how support issues are triaged before they become incidents, see [Support SLA](../policy/support-sla.md#triage).

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

- **Crash spike**: Withdraw the affected release (see [Rollback](rollback.md)); reproduce with the reporter's support bundle and fix
- **Broken installer**: Withdraw the release; rebuild from the tag, check the artifacts and checksums, and re-publish (see [Disaster recovery](#disaster-recovery))
- **Data loss**: Document a workaround; release a hotfix ASAP

### 5. Resolve

- Implement fix
- Test thoroughly
- Release a hotfix or patch (see the hotfix checklist in [Rollback](rollback.md))

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
- An installer that does not install or start
- Data loss or corruption
- Security vulnerability

See [Rollback Runbook](rollback.md).

## Backup and disaster recovery

What to keep, and how to recover when a repository or a release is lost.

### What is backed up

| Asset | Where it lives | How it is kept |
| --- | --- | --- |
| Release installers and checksums | GitHub Releases | Retained with each release. Do not delete releases; withdraw them instead (see [Rollback](rollback.md)). Export installers of major versions to storage you control. |
| Documentation and build configuration | The repository | Git history versions every change. Tag releases to preserve the state of the docs. |
| Signing keys and credentials | Your password manager or encrypted storage | See [Key management](key-management.md). Never in the repository. |

### Disaster recovery

**The GitHub repository is compromised or lost**

1. Verify the integrity of a trusted local clone.
2. Create a new repository if needed and push from the trusted clone.
3. Re-create the releases from your installer backups, or rebuild them (below).
4. Rotate every signing key and credential (see [Key management](key-management.md)).
5. Say what happened in the release notes if the repository moved.

**Release installers are lost**

1. Check out the release tag: `git checkout vX.Y.Z`.
2. Run the build as CI does (see [What CI builds](release-deployment-runbook.md#what-ci-builds)), or open a pull request (or push a `phase_*` branch) at that tag so `desktop-electron.yml` runs. The workflow has no manual trigger.
3. Re-sign and re-notarize the macOS build.
4. Re-publish the installers and checksums to the GitHub release.

### Check your backups

- Monthly: confirm the release installers still download, and that you can build from a tag.
- Quarterly: do a full restore drill (build from a tag and verify the output) and update this section if the steps changed.

### Retention

- Release installers: keep them for every supported version.
- Support bundles that users send: keep them for 30 days, then delete them.

## Related Documents

- [Support SLA](../policy/support-sla.md)
- [Rollback](rollback.md)
- [Release Deployment Runbook](release-deployment-runbook.md)
- [Support SLA Playbook](../security/support-sla-playbook.md)
