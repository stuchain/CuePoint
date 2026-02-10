# Maintenance Policy — CuePoint

**Long-term maintenance and evolution**  
**Version 1.0 — 2026-02-04**  
**Last updated**: 2026-02-04

## Overview

This policy defines how CuePoint maintains stability, security, and evolvability over time. It covers dependency updates, technical debt reviews, compatibility planning, and sunsetting of features and data formats.

## 1. Dependency Maintenance

### 1.1 Update Cadence

| Type | Cadence | Notes |
| --- | --- | --- |
| **Minor/patch updates** | Monthly | Review and merge Dependabot PRs; run full test suite |
| **Major updates** | Quarterly | Evaluate breaking changes; plan migration |
| **Security patches** | Immediate | See Security Patch SLA below |

### 1.2 Dependency Policy

- **Production dependencies**: Pinned in `requirements.txt` with exact versions.
- **Development dependencies**: Pinned in `requirements-dev.txt`.
- **Build dependencies**: Pinned in `requirements-build.txt`.
- **Update workflow**: Check for updates → Run tests → Update changelog → Merge.

### 1.3 Dependency Audit

- **Tools**: `pip-audit` (vulnerabilities), `pip-licenses` (license compliance).
- **Schedule**: Weekly in CI; manual audit before each release.
- **CI integration**: `security-scan.yml` and `test.yml` run `pip-audit` on all requirement files.

### 1.4 Dependency Update Checklist

- [ ] Update requirements (requirements.txt, requirements-dev.txt)
- [ ] Run full test suite (`python scripts/run_tests.py --all`)
- [ ] Run `pip-audit` (must pass)
- [ ] Update changelog and release notes
- [ ] Verify no breaking changes in dependent code

## 2. Security Patch SLA

### 2.1 Response Times

| Severity | Target | Description |
| --- | --- | --- |
| **Critical** | 7 days | Remote code execution, data breach, auth bypass |
| **High** | 14 days | Significant data exposure, privilege escalation |
| **Medium** | 30 days | Limited exposure, information disclosure |
| **Low** | Next release | Minor issues, limited impact |

### 2.2 Security Patch Workflow

1. **Identify**: Dependabot alert, `pip-audit`, or external report.
2. **Assess**: Determine severity and impact (see [Vulnerability Patch Runbook](../security/vulnerability-patch.md)).
3. **Patch**: Update dependency or apply workaround.
4. **Release**: Hotfix release for Critical/High; include in next release for Medium/Low.
5. **Communicate**: Security advisory for Critical/High; release notes for all.

### 2.3 Critical CVE Process

- Create `security/fix-<cve-id>` branch.
- Apply patch and run full test suite.
- Fast-track review and merge.
- Publish hotfix release within 7 days.
- Create GitHub security advisory if applicable.

## 3. Technical Debt Reviews

### 3.1 Cadence

- **Quarterly** audit of core modules.
- **Monthly** grooming of tech-debt backlog.
- **Target**: Reduce backlog by 10% per quarter.

### 3.2 Review Scope

- Core modules: parsing, matching, export, search providers.
- Deprecated code and config keys.
- Test coverage gaps.
- Performance hotspots.
- Code complexity (radon, pylint).

### 3.3 Tech Debt Review Checklist

- [ ] Identify hotspots (complexity, coupling, duplication)
- [ ] Create refactor plan with priorities
- [ ] Add items to [Maintenance Roadmap](maintenance-roadmap.md)
- [ ] Track in issues with `tech-debt` label
- [ ] Prioritize by impact and risk

### 3.4 Refactor Prioritization

- **P0**: Blocking stability or security.
- **P1**: High impact, moderate effort.
- **P2**: Backlog; evaluated quarterly.

## 4. Compatibility Planning

### 4.1 Compatibility Matrix

See [Compatibility Matrix](compatibility-matrix.md) for:

- **OS versions**: Windows, macOS, Linux.
- **Python versions**: Supported and tested.
- **Rekordbox XML versions**: See [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md).

### 4.2 New OS Version Testing

- **Beta channels**: Test on new OS betas before general availability.
- **Schedule**: Add compatibility tests before each major release.
- **Documentation**: Update compatibility matrix with each release.

### 4.3 Compatibility Test Suite

- Run on Windows, macOS in CI (see `test.yml` matrix).
- Integration tests with sample XML fixtures.
- Document manual testing for new OS versions.

## 5. Maintenance Roadmap

### 5.1 Purpose

The [Maintenance Roadmap](maintenance-roadmap.md) tracks:

- Planned refactors and upgrades.
- Deprecation schedule.
- Compatibility work.
- Tech-debt items.

### 5.2 Review Cadence

- **Quarterly**: Update roadmap, reprioritize backlog.
- **Annual**: Long-term planning, architecture review.
- **Pre-release**: Confirm target versions for planned items.

## 6. Sunsetting Policy

### 6.1 Notice Period

- **Minimum**: 90 days before removal or breaking change.
- **Announcement**: Release notes, changelog, documentation.
- **Exceptions**: Security fixes or legal compliance may require shorter notice.

### 6.2 Sunsetting Process

1. **Announce**: Add deprecation notice in release notes and docs.
2. **Document**: Provide migration steps and alternatives.
3. **Warn**: Emit warnings when deprecated features are used.
4. **Remove**: After notice period, remove in major or minor release.

### 6.3 What We Sunset

- Config keys (renamed or removed).
- CLI flags (removed or changed).
- Output formats (schema changes).
- APIs (internal or public interfaces).

See [Deprecation Policy](../policy/deprecation-policy.md) and [Deprecation Schedule](../policy/deprecation-schedule.md) for details.

## 7. Maintenance Metrics

### 7.1 KPIs

| Metric | Target |
| --- | --- |
| Mean time to update deps (critical) | < 7 days |
| Tech-debt backlog closure | 10% per quarter |
| Dependency audit pass rate | 100% |
| Full test suite pass rate | 100% |

### 7.2 Maintenance Report

Run `python main.py --maintenance-report` to generate a maintenance status report (dependencies, compatibility, audit status).

## 8. Maintenance Ownership

| Area | Owner | Responsibility |
| --- | --- | --- |
| Dependencies | Engineering | Update cadence, security patches |
| Documentation | Docs | Policy updates, changelog |
| Compatibility | Engineering | OS/version testing, matrix updates |
| Tech debt | Engineering | Quarterly reviews, backlog grooming |

## 9. Related Documents

- [Vulnerability Patch Runbook](../security/vulnerability-patch.md)
- [Deprecation Policy](../policy/deprecation-policy.md)
- [Deprecation Schedule](../policy/deprecation-schedule.md)
- [Compatibility Matrix](compatibility-matrix.md)
- [Maintenance Roadmap](maintenance-roadmap.md)
- [Release Strategy](release-strategy.md)
- [Roadmap](../roadmap.md)
