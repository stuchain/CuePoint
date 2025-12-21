# Rollback Procedure Runbook

## Purpose
Rollback a release that has critical issues.

## Prerequisites
- Critical issue identified in current release
- Previous release is stable
- Rollback decision is approved

## Steps

### Step 1: Assess Situation
1. Identify the issue
2. Determine severity (critical/high/medium)
3. Assess impact on users
4. Decide if rollback is necessary

### Step 2: Prepare Rollback
1. Identify previous stable release version
2. Verify previous release artifacts are available
3. Prepare rollback announcement
4. Notify team of rollback

### Step 3: Execute Rollback
1. Create new release pointing to previous version
2. Update release notes with rollback reason
3. Mark problematic release as deprecated
4. Update download links if needed

### Step 4: Communicate
1. Announce rollback on GitHub
2. Update GitHub Discussions
3. Notify affected users if applicable
4. Document rollback reason

### Step 5: Post-Rollback
1. Investigate root cause
2. Plan fix for next release
3. Update procedures if needed
4. Document lessons learned

## Verification
- [ ] Previous release is available
- [ ] Rollback release is created
- [ ] Users can download previous version
- [ ] Communication is sent
- [ ] Issue is documented

## Troubleshooting

### Issue: Previous Release Not Available
**Symptoms**: Can't find previous release artifacts
**Cause**: Artifacts deleted or not available
**Solution**:
1. Check GitHub Releases archive
2. Rebuild from previous tag if needed
3. Use backup if available

### Issue: Users Already Updated
**Symptoms**: Users have already installed problematic release
**Cause**: Auto-update or manual update
**Solution**:
1. Provide clear rollback instructions
2. Update auto-update mechanism
3. Provide support for users

## Related Procedures
- [Release Deployment](Release_Deployment.md)
- [Hotfix Release](Hotfix_Release.md)

## Last Updated
2025-12-16

