# Support SLA — CuePoint

**Version 1.1 — 2026-10-07**
**Last updated**: 2026-10-07

How CuePoint support works: where to ask, how fast we aim to answer, how issues are triaged and escalated, and which numbers we track.

## Response Time Expectations

We aim to respond to support requests within the following timeframes:

| Priority | Description | Response Target | Resolution Target |
| --- | --- | --- | --- |
| **P0** | Crash, data loss, security vulnerability | 24 hours | 24 hours (a hotfix) |
| **P1** | Major functionality broken, no workaround | 48 hours | 7 days |
| **P2** | Minor issue, workaround exists | 5 business days | Backlog |

Live incidents also carry the Sev1, Sev2 and Sev3 targets in the [Incident Response Runbook](../release/incident-response-runbook.md).

## Support Channels

- **GitHub Issues** ([CuePoint Issues](https://github.com/stuchain/CuePoint/issues)): the primary channel for bug reports, feature requests and support questions. Pick the template that fits:
  - [Bug Report](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml)
  - [Feature Request](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml)
  - [Support Question](https://github.com/stuchain/CuePoint/issues/new?template=support_question.yml)
  - [Security Vulnerability](https://github.com/stuchain/CuePoint/issues/new?template=security_vulnerability.yml) (see also the [Security Response Process](../security/security-response-process.md))
- **GitHub Discussions** ([CuePoint Discussions](https://github.com/stuchain/CuePoint/discussions)): questions about usage, ideas, shared workflows and non-urgent feedback. Best effort, usually within a few days.
- **Email**: organizations that need direct contact can look for an address in the project README. It may not be available.

## Support Hours

Support is provided on a best-effort basis. Responses are typically provided during business hours (Mon–Fri, 9–17 UTC). Critical (P0) issues may receive attention outside these hours.

## What to Include

When you report an issue, please include:

1. **A support bundle**: in the app, choose **Help > Export support bundle...** (from the CLI, run `python main.py --export-support-bundle`). It is required for crashes and complex issues. The bundle holds diagnostics (app version, OS, a config summary), your logs and any crash logs. Paths in the logs are redacted.
2. **Steps to reproduce**, and what you expected against what happened.
3. **Your environment**: OS version, app version and Rekordbox version.

Support bundles that users send are kept for 30 days, then deleted.

## Triage

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

4. **Support bundle.** If there is none on a crash or a complex issue, ask for one (see the template below).
5. **Owner.** Assign a maintainer or support lead for P0 and P1. P2 can stay unassigned until the backlog is groomed.
6. **Reproduce.** Use the run ID and diagnostics. Check the logs for ERROR and CRITICAL entries, and the config in the bundle for anything odd.
7. **Resolve or escalate.**
   - Fix it and record the fix in the changelog.
   - If there is a workaround, add it to [Troubleshooting](../user-guide/troubleshooting.md) or the FAQ.
   - Escalate P0 as below.

### Triage checklist

- [ ] Issue labelled
- [ ] Severity assigned
- [ ] Owner assigned (P0 and P1)
- [ ] Support bundle requested (crash or complex issue)
- [ ] Run ID captured, if there is one
- [ ] Logs reviewed
- [ ] Fix verified

## Escalation

| Priority | Escalate to | Action |
| --- | --- | --- |
| **P0** | A maintainer, immediately | Make a hotfix plan, assess how many users are affected, and tell users if it is widespread. A hotfix may follow (see [Rollback](../release/rollback.md)). |
| **P1** | The support lead | Address it in the current cycle; aim for the next patch release. |
| **P2** | The backlog | Address it when capacity allows. |

See the [Support SLA Playbook](../security/support-sla-playbook.md) for the detailed triage and escalation procedure.

## Response Templates

Thanks for the report:

```text
Thanks for reporting this issue. We have given it [P0/P1/P2] priority.

For faster resolution, please attach a support bundle if you have not already:
in the app, choose Help > Export support bundle...

We will update this issue as we investigate.
```

Request a support bundle:

```text
To help us diagnose this, could you attach a support bundle?

1. In the app, choose Help > Export support bundle...
2. Or run: python main.py --export-support-bundle

The bundle contains diagnostics and logs with user paths redacted.
```

Resolution summary:

```text
**Resolution:** [Brief summary]
**Fix version:** [Version number]
**Workaround:** [If applicable]
```

## What We Track

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

## Limitations

- Support is provided as a best-effort community service.
- No guarantee of resolution time is made beyond these targets.
- Commercial support may be available separately.

## Contact

For support, open an issue in the CuePoint repository. See also the [Support Policy](../user-guide/support-policy.md).
