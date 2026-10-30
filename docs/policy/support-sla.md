# Support and maintenance

How fast issues are answered, how they are triaged, and how the project keeps its dependencies, security patches and old versions in order.

## Support SLA
How CuePoint support works: where to ask, how fast we aim to answer, how issues are triaged and escalated, and which numbers we track.

### Response Time Expectations

We aim to respond to support requests within the following timeframes:

| Priority | Description | Response Target | Resolution Target |
| --- | --- | --- | --- |
| **P0** | Crash, data loss, security vulnerability | 24 hours | 24 hours (a hotfix) |
| **P1** | Major functionality broken, no workaround | 48 hours | 7 days |
| **P2** | Minor issue, workaround exists | 5 business days | Backlog |

Live incidents also carry the Sev1, Sev2 and Sev3 targets in the [Incident Response Runbook](../release/incident-response-runbook.md).

### Support Channels

- **GitHub Issues** ([CuePoint Issues](https://github.com/stuchain/CuePoint/issues)): the primary channel for bug reports, feature requests and support questions. Pick the template that fits:
  - [Bug Report](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml)
  - [Feature Request](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml)
  - [Support Question](https://github.com/stuchain/CuePoint/issues/new?template=support_question.yml)
  - [Security Vulnerability](https://github.com/stuchain/CuePoint/issues/new?template=security_vulnerability.yml) (see also the [Security Response Process](../security/security.md))
- **GitHub Discussions** ([CuePoint Discussions](https://github.com/stuchain/CuePoint/discussions)): questions about usage, ideas, shared workflows and non-urgent feedback. Best effort, usually within a few days.
- **Email**: organizations that need direct contact can look for an address in the project README. It may not be available.

### Support Hours

Support is provided on a best-effort basis. Responses are typically provided during business hours (Mon–Fri, 9–17 UTC). Critical (P0) issues may receive attention outside these hours.

### What to Include

When you report an issue, please include:

1. **A help file**: in the app, choose **Help > Get help... > Save a help file...** (from the CLI, run `python main.py --export-support-bundle`). It is required for crashes and complex issues. The file holds diagnostics (app version, OS, a config summary), your logs and any crash logs. Your home folder and tokens are redacted; file names in the logs are not.
2. **Steps to reproduce**, and what you expected against what happened.
3. **Your environment**: OS version, app version and Rekordbox version.

Help files that users send are kept for 30 days, then deleted.

### Triage

Maintainers triage new issues like this.

1. **Intake.** A user opens an issue with one of the templates above.
2. **Severity.** Assign P0, P1 or P2 and apply the label `priority:P0`, `priority:P1` or `priority:P2`.
3. **Category.** Apply one of `category:crash`, `category:matching`, `category:performance` or `category:ui`.

   | Category | What it covers | Examples |
   | --- | --- | --- |
   | Crash | An unhandled exception, or the app exits unexpectedly | An uncaught exception |
   | Matching quality | Wrong or missing matches | An incorrect Beatport match, no matches |
   | Performance | Slow runs, high memory | Timeouts, stalls, out of memory |
   | UI | Layout, responsiveness, accessibility | A button that is not visible |

4. **Help file.** If there is none on a crash or a complex issue, ask for one (see the template below).
5. **Owner.** Assign a maintainer or support lead for P0 and P1. P2 can stay unassigned until the backlog is groomed.
6. **Reproduce.** Use the run ID and diagnostics. Check the logs for ERROR and CRITICAL entries, and the config in the bundle for anything odd.
7. **Resolve or escalate.**
   - Fix it and record the fix in the changelog.
   - If there is a workaround, add it to [Troubleshooting](../user-guide/troubleshooting.md) or the FAQ.
   - Escalate P0 as below.

#### Triage checklist

- [ ] Issue labelled
- [ ] Severity assigned
- [ ] Owner assigned (P0 and P1)
- [ ] Help file requested (crash or complex issue)
- [ ] Run ID captured, if there is one
- [ ] Logs reviewed
- [ ] Fix verified

### Escalation

| Priority | Escalate to | Action |
| --- | --- | --- |
| **P0** | A maintainer, immediately | Make a hotfix plan, assess how many users are affected, and tell users if it is widespread. A hotfix may follow (see [Rollback](../release/rollback.md)). |
| **P1** | The support lead | Address it in the current cycle; aim for the next patch release. |
| **P2** | The backlog | Address it when capacity allows. |

See the [Support SLA Playbook](support-sla.md) for the detailed triage and escalation procedure.

### Response Templates

Thanks for the report:

```text
Thanks for reporting this issue. We have given it [P0/P1/P2] priority.

For faster resolution, please attach a help file if you have not already:
in the app, choose Help > Get help... > Save a help file...

We will update this issue as we investigate.
```

Request a help file:

```text
To help us diagnose this, could you attach a help file?

1. In the app, choose Help > Get help... > Save a help file...
2. Or run: python main.py --export-support-bundle

The file contains diagnostics and logs with your home folder and tokens redacted.
```

Resolution summary:

```text
**Resolution:** [Brief summary]
**Fix version:** [Version number]
**Workaround:** [If applicable]
```

### What We Track

We track these by hand, from GitHub issues, for a monthly review.

| Measure | Target | How it is measured |
| --- | --- | --- |
| Time to first response (TTFR) | P0: 24 hours, P1: 48 hours, P2: 5 business days | Issue open to first maintainer comment |
| Time to resolution (TTR) | P1: under 7 days | Issue open to closed |
| P0 resolution | Under 24 hours | A hotfix released within 24 hours |
| Support issues per release | Under 10 | Issues opened in the first 2 weeks after a release |
| Issues per week | Track the trend | Count opened and closed |
| Incidents | Track | Count Sev1, Sev2 and Sev3 |
| Hotfixes | Minimize | Count per release cycle |

Count issues with the GitHub API or a project board, or script a query that groups by label. In the monthly review, go through the numbers, any incidents and the follow-up actions.

Report template:

```text
## Support metrics report - [Month YYYY]

Issues opened: [N]
Issues closed: [N]
Average response time: [N] hours
P0 resolved within 24 hours: [Yes/No]
Support issues this release: [N]
Incidents: Sev1 [N], Sev2 [N], Sev3 [N]
```

### Limitations

- Support is provided as a best-effort community service.
- No guarantee of resolution time is made beyond these targets.
- Commercial support may be available separately.

### Contact

For support, open an issue in the CuePoint repository. See also the [Support Policy](../user-guide/support-policy.md).

## Support SLA Playbook

Triage and escalation procedures for CuePoint support.

### Priority Classifications

| Priority | Description | Response Target |
| --- | --- | --- |
| **P0** | Crash, data loss, security | 24 hours |
| **P1** | Major functionality broken | 48 hours |
| **P2** | Minor issue, workaround exists | 5 days |

### Triage Workflow

1. **Intake**: User reports via GitHub Issues.
2. **Categorize**: Assign priority (P0/P1/P2) and category (crash, matching, performance, UI).
3. **Request bundle**: If not attached, ask for Support Bundle (Help > Export Support Bundle).
4. **Reproduce**: Use run ID and diagnostics to reproduce; check logs for errors.
5. **Resolve or escalate**: Fix, document workaround, or escalate to maintainers.

### Categories

- **Crash**: Unhandled exception, app exits. Check crash logs in `crashes/`.
- **Matching quality**: Wrong or missing matches. Check query generation, scoring.
- **Performance**: Slow runs, high memory. Check performance report, concurrency.
- **UI issue**: Layout, responsiveness, accessibility.

### Support Bundle Review Checklist

- [ ] Verify run ID in diagnostics.json
- [ ] Check logs for ERROR/CRITICAL
- [ ] Check crash file if crash reported
- [ ] Verify config (sanitized) for anomalies
- [ ] Note OS and app version

### Escalation

- **P0**: Notify maintainers immediately; consider hotfix release.
- **P1**: Add to sprint; target next patch.
- **P2**: Backlog; address when capacity allows.

### Runbook: Crash Spike

1. Identify affected version from issues.
2. Profile and fix root cause.
3. Release a hotfix (see the [Rollback runbook](../release/rollback.md)).

### Runbook: Log Loss

1. Ask user to re-run with `--debug` (CLI) or enable verbose logging.
2. Request fresh support bundle.
3. Check log path permissions.

## Maintenance Policy
**Long-term maintenance and evolution**\

### Overview

This policy defines how CuePoint maintains stability, security, and evolvability over time. It covers dependency updates, technical debt reviews, compatibility planning, and sunsetting of features and data formats.

### 1. Dependency Maintenance

#### 1.1 Update Cadence

| Type | Cadence | Notes |
| --- | --- | --- |
| **Minor/patch updates** | Monthly | Review and merge Dependabot PRs; run full test suite |
| **Major updates** | Quarterly | Evaluate breaking changes; plan migration |
| **Security patches** | Immediate | See Security Patch SLA below |

#### 1.2 Dependency Policy

- **Production dependencies**: Pinned in `requirements.txt` with exact versions.
- **Development dependencies**: Pinned in `requirements-dev.txt`.
- **Build dependencies**: Pinned in `requirements-build.txt`.
- **Update workflow**: Check for updates → Run tests → Update changelog → Merge.

#### 1.3 Dependency Audit

- **Tools**: `pip-audit` (vulnerabilities), `pip-licenses` (license compliance).
- **Schedule**: Weekly in CI; manual audit before each release.
- **CI integration**: `security-scan.yml` runs `pip-audit` on `requirements.txt`, `requirements-build.txt` and `requirements-dev.txt` on pushes, pull requests and weekly.

#### 1.4 Dependency Update Checklist

- [ ] Update requirements (requirements.txt, requirements-dev.txt)
- [ ] Run full test suite (`python scripts/run_tests.py --all`)
- [ ] Run `pip-audit` (must pass)
- [ ] Update changelog and release notes
- [ ] Verify no breaking changes in dependent code

### 2. Security Patch SLA

#### 2.1 Response Times

| Severity | Target | Description |
| --- | --- | --- |
| **Critical** | 7 days | Remote code execution, data breach, auth bypass |
| **High** | 14 days | Significant data exposure, privilege escalation |
| **Medium** | 30 days | Limited exposure, information disclosure |
| **Low** | Next release | Minor issues, limited impact |

#### 2.2 Security Patch Workflow

1. **Identify**: Dependabot alert, `pip-audit`, or external report.
2. **Assess**: Determine severity and impact (see [Vulnerability Patch Runbook](../security/security.md)).
3. **Patch**: Update dependency or apply workaround.
4. **Release**: Hotfix release for Critical/High; include in next release for Medium/Low.
5. **Communicate**: Security advisory for Critical/High; release notes for all.

#### 2.3 Critical CVE Process

- Create `security/fix-<cve-id>` branch.
- Apply patch and run full test suite.
- Fast-track review and merge.
- Publish hotfix release within 7 days.
- Create GitHub security advisory if applicable.

### 3. Technical Debt Reviews

#### 3.1 Cadence

- **Quarterly** audit of core modules.
- **Monthly** grooming of tech-debt backlog.
- **Target**: Reduce backlog by 10% per quarter.

#### 3.2 Review Scope

- Core modules: parsing, matching, export, search providers.
- Deprecated code and config keys.
- Test coverage gaps.
- Performance hotspots.
- Code complexity, reviewed by hand (no complexity tool is installed).

#### 3.3 Tech Debt Review Checklist

- [ ] Identify hotspots (complexity, coupling, duplication)
- [ ] Create refactor plan with priorities
- [ ] Track in issues with `tech-debt` label
- [ ] Prioritize by impact and risk

#### 3.4 Refactor Prioritization

- **P0**: Blocking stability or security.
- **P1**: High impact, moderate effort.
- **P2**: Backlog; evaluated quarterly.

### 4. Compatibility Planning

#### 4.1 Compatibility Matrix

The [Support Policy](../user-guide/support-policy.md) lists what is supported and tested:

- **OS versions**: Windows, macOS, Linux.
- **Python versions**: Supported and tested.
- **Rekordbox XML versions**: See the [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md).

#### 4.2 New OS Version Testing

- **Beta channels**: Test on new OS betas before general availability.
- **Schedule**: Add compatibility tests before each major release.
- **Documentation**: Update the Support Policy and the Rekordbox Compatibility Matrix when support changes.

#### 4.3 Compatibility Test Suite

- Run on Windows, macOS and Linux in CI (see the matrices in `desktop-electron.yml` and `release-gates.yml`).
- Integration tests with sample XML fixtures.
- Document manual testing for new OS versions.

### 5. Planning and Review

There is no separate maintenance roadmap document. Planned refactors, upgrades, compatibility work and tech-debt items live in GitHub issues (see the `maintenance_task` issue template), and the product plan is in the [Roadmap](../v1/ROADMAP.md).

#### 5.1 Review Cadence

- **Quarterly**: Review the issues above and reprioritize the backlog.
- **Annual**: Long-term planning and an architecture review.
- **Pre-release**: Confirm the target versions for planned items.

### 6. Sunsetting Policy

#### 6.1 Notice Period

- **Minimum**: 90 days before removal or breaking change.
- **Announcement**: Release notes, changelog, documentation.
- **Exceptions**: Security fixes or legal compliance may require shorter notice.

#### 6.2 Sunsetting Process

1. **Announce**: Add deprecation notice in release notes and docs.
2. **Document**: Provide migration steps and alternatives.
3. **Warn**: Emit warnings when deprecated features are used.
4. **Remove**: After notice period, remove in major or minor release.

#### 6.3 What We Sunset

- Config keys (renamed or removed).
- CLI flags (removed or changed).
- Output formats (schema changes).
- APIs (internal or public interfaces).

See [Deprecation Policy](compatibility.md) and [Deprecation Schedule](compatibility.md) for details.

### 7. Maintenance Metrics

#### 7.1 KPIs

| Metric | Target |
| --- | --- |
| Mean time to update deps (critical) | < 7 days |
| Tech-debt backlog closure | 10% per quarter |
| Dependency audit pass rate | 100% |
| Full test suite pass rate | 100% |

#### 7.2 Maintenance Report

Run `python main.py --maintenance-report` to generate a maintenance status report (dependencies, compatibility, audit status).

### 8. Maintenance Ownership

| Area | Owner | Responsibility |
| --- | --- | --- |
| Dependencies | Engineering | Update cadence, security patches |
| Documentation | Docs | Policy updates, changelog |
| Compatibility | Engineering | OS/version testing, matrix updates |
| Tech debt | Engineering | Quarterly reviews, backlog grooming |

### 9. Related Documents

- [Vulnerability Patch Runbook](../security/security.md)
- [Deprecation Policy](compatibility.md)
- [Deprecation Schedule](compatibility.md)
- [Support Policy](../user-guide/support-policy.md)
- [Release Deployment Runbook](../release/release-deployment-runbook.md)
- [Roadmap](../v1/ROADMAP.md)
