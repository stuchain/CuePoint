# Operations KPIs and Metrics

## Purpose

Track key performance indicators for support, releases, and operational health.

## Support KPIs

| KPI | Target | Measurement |
| --- | --- | --- |
| **Time to first response (TTFR)** | P0: 24h, P1: 48h, P2: 5d | Time from issue open to first maintainer comment |
| **Time to resolution (TTR)** | P1: < 7 days | Time from open to closed |
| **P0 resolution** | < 24 hours | Hotfix released within 24h |
| **Support tickets per release** | < 10 | Count of issues opened in first 2 weeks post-release |
| **Satisfaction** | > 80% | Post-resolution survey (if implemented) |

## Release Health KPIs

| KPI | Target | Measurement |
| --- | --- | --- |
| **Update success rate** | > 95% | % of update checks that succeed |
| **Install success rate** | > 95% | % of installs that complete |
| **Download success** | > 98% | % of downloads that complete |
| **Crash rate** | < 2% | Crashes / sessions (if telemetry opt-in) |

## Ops Metrics

| Metric | Target | Notes |
| --- | --- | --- |
| **Issues per week** | Track trend | Count opened, closed |
| **Avg response time** | < 24h | For P0/P1 |
| **Incident count** | Track | Sev1/Sev2/Sev3 |
| **Hotfix count** | Minimize | Per release cycle |

## Metrics Report Template

```
## Support Metrics Report – [Month YYYY]

**Issues opened:** [N]
**Issues closed:** [N]
**Avg response time:** [N]h
**P0 resolved in 24h:** [Y/N]
**Support tickets this release:** [N]

## Incidents

**Sev1:** [N]
**Sev2:** [N]
**Sev3:** [N]

## Release Health

**Update success:** [%]
**Install success:** [%]
```

## Example Report

```
## Support Metrics Report – February 2026

**Issues opened:** 12
**Issues closed:** 10
**Avg response time:** 24h
**P0 resolved in 24h:** Yes
**Support tickets this release:** 3

## Incidents

**Sev1:** 0
**Sev2:** 1
**Sev3:** 2

## Release Health

**Update success:** 97%
**Install success:** 98%
```

## Collection

- **Manual**: Count issues via GitHub API or project board
- **Automated** (optional): Script to query GitHub Issues, aggregate by label
- **Monthly review**: Compile report; discuss in ops review

## Monthly Ops Review Agenda

- Support metrics summary
- Incident summary (if any)
- Roadmap adjustments
- Action items

## Related Documents

- [Triage Workflow](triage-workflow.md)
- [Support SLA](../policy/support-sla.md)
- [Ops Index](ops-index.md)
