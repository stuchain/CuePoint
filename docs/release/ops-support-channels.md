# Post-Launch Support Channels

## Overview

CuePoint provides support through the following channels. Use the appropriate channel for your needs.

## Primary Channels

### GitHub Issues

**Purpose**: Bug reports, feature requests, and technical support.

**URL**: [CuePoint Issues](https://github.com/stuchain/CuePoint/issues)

**Use for**:
- Bug reports (use [Bug Report template](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml))
- Feature requests (use [Feature Request template](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml))
- Security vulnerabilities (use [Security template](https://github.com/stuchain/CuePoint/issues/new?template=security_vulnerability.yml))
- Support questions (use [Support Question template](https://github.com/stuchain/CuePoint/issues/new?template=support_question.yml))

**Response expectations**: See [Support SLA](../policy/support-sla.md).

### GitHub Discussions

**Purpose**: Community Q&A, ideas, and general feedback.

**URL**: [CuePoint Discussions](https://github.com/stuchain/CuePoint/discussions)

**Use for**:
- General questions about usage
- Feature ideas and brainstorming
- Sharing workflows and tips
- Non-urgent feedback

**Response expectations**: Best-effort; typically within a few days.

### In-App Report Issue

**Purpose**: Report issues directly from the application with pre-filled environment details.

**How to access**: Help → Report Issue

**Features**:
- Pre-fills CuePoint version and OS
- Optional support bundle generation and attachment
- Can submit as bug, feature request, or general feedback

## Optional Support

### Email Support

For organizations requiring direct contact, email support may be available. See the project README for current contact information.

## Support Bundle (Required for Crashes)

When reporting crashes or complex issues, include a **support bundle**:

1. **GUI**: Help → Support & Diagnostics → Export Support Bundle
2. **CLI**: `cuepoint --export-support-bundle` (or `python main.py --export-support-bundle`)

The bundle contains:
- `diagnostics.json` – App version, OS, config summary
- `logs/` – Application logs
- `crashes/` – Crash logs (if any)
- `config.yaml` – Sanitized configuration

## Escalation

- **P0 (Critical)**: Maintainers notified immediately; hotfix may be considered
- **P1 (Major)**: Addressed in sprint; target next patch release
- **P2 (Minor)**: Backlog; addressed when capacity allows

See [Triage Workflow](triage-workflow.md) and [Support SLA Playbook](../security/support-sla-playbook.md). 

## Related Documents

- [Triage Workflow](triage-workflow.md)
- [Support SLA](../policy/support-sla.md)
- [Support Policy](../user-guide/support-policy.md)
- [Ops Index](ops-index.md)
