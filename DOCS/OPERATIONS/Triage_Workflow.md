# Issue Triage Workflow

## Overview

This document defines the issue triage workflow for CuePoint. The triage process ensures that issues are properly classified, prioritized, and assigned for resolution.

## Triage Process

### 1. New Issue Submitted

When a new issue is submitted:
- Auto-label based on template (via GitHub Actions labeler)
- Add `status: triage` label automatically
- Issue appears in "Triage" column of project board

### 2. Triage Review

A team member reviews the issue:
- **Review issue details**: Read the issue description, check attached files/screenshots
- **Classify priority**: Assign priority label (critical, high, medium, low)
- **Classify type**: Verify type label (bug, feature, enhancement, question, documentation)
- **Add appropriate labels**: Add any additional relevant labels
- **Check for duplicates**: Search for similar existing issues

### 3. Assignment

After triage review:
- **Assign to appropriate team member**: Based on expertise and workload
- **Set milestone** (if applicable): Link to release milestone
- **Update status**: Change from `status: triage` to `status: in-progress`
- **Add to project board**: Move to "In Progress" column

### 4. Resolution

When issue is resolved:
- **Fix issue**: Implement the fix or feature
- **Update status**: Change to `status: resolved` or `status: needs-review` if PR is created
- **Link PR**: Reference the pull request that fixes the issue
- **Close issue**: Close the issue when PR is merged
- **Update project board**: Move to "Done" column

## Priority Guidelines

### Critical (`priority: critical`)
- Security vulnerabilities
- Data loss or corruption
- Application crashes that prevent use
- Critical bugs that break core functionality
- **Response Time**: Immediate (within hours)
- **Resolution Time**: Within 24 hours

### High (`priority: high`)
- Major bugs affecting many users
- Missing critical features
- Performance issues significantly impacting usability
- **Response Time**: Within 24 hours
- **Resolution Time**: Within 1 week

### Medium (`priority: medium`)
- Minor bugs with workarounds
- Feature enhancements
- Documentation updates
- **Response Time**: Within 3 days
- **Resolution Time**: Within 1 month

### Low (`priority: low`)
- Nice-to-have features
- UI polish and improvements
- Non-critical improvements
- **Response Time**: Within 1 week
- **Resolution Time**: As time permits

## Type Classification

### Bug (`type: bug`)
- Application errors or unexpected behavior
- Use `bug_report.yml` or `error_report.yml` template

### Feature (`type: feature`)
- New feature requests
- Use `feature_request.yml` template

### Enhancement (`type: enhancement`)
- Improvements to existing features
- Can use `feature_request.yml` template

### Question (`type: question`)
- User questions or support requests
- Use `support_question.yml` template

### Documentation (`type: documentation`)
- Documentation issues or improvements
- Missing or incorrect documentation

## Status Labels

### `status: triage`
- New issue awaiting triage review
- Default status for all new issues

### `status: in-progress`
- Issue is being worked on
- Assigned to a team member

### `status: blocked`
- Issue is blocked by another issue or dependency
- Cannot proceed until blocker is resolved

### `status: needs-review`
- Fix is implemented, awaiting code review
- PR is created and needs review

### `status: resolved`
- Issue is fixed and resolved
- Ready to be closed

## Triage Checklist

When triaging an issue, ensure:

- [ ] Issue is clear and actionable
- [ ] Priority is set correctly
- [ ] Type is set correctly
- [ ] All relevant labels are applied
- [ ] Issue is assigned to appropriate team member
- [ ] Milestone is set (if applicable)
- [ ] Duplicate issues are identified and linked
- [ ] Related issues are linked

## Assignment Rules

### By Priority
- **Critical**: Assign to senior team member immediately
- **High**: Assign within 24 hours
- **Medium**: Assign within 3 days
- **Low**: Assign when capacity allows

### By Type
- **Bug**: Assign to developer familiar with affected area
- **Feature**: Assign to developer or product owner
- **Documentation**: Assign to technical writer or developer
- **Question**: Assign to support team or knowledgeable developer

## Project Board Workflow

The project board has the following columns:

1. **Triage**: New issues awaiting review
2. **In Progress**: Issues being worked on
3. **Review**: Issues with PRs awaiting review
4. **Done**: Resolved and closed issues

### Automation Rules

- **New Issue**: Automatically added to "Triage" column
- **Assigned**: Automatically moved to "In Progress" column
- **PR Created**: Automatically moved to "Review" column
- **Issue Closed**: Automatically moved to "Done" column

## Related Procedures

- [Release Deployment](Release/Release_Deployment.md)
- [Support Escalation](Support/Support_Escalation.md)
- [Security Incident Response](Security/Security_Incident_Response.md)

## Last Updated

2025-01-XX

