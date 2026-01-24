# Rollback Plan for CuePoint Releases

## Overview

This document outlines procedures for rolling back a CuePoint release if critical issues are discovered after deployment.

---

## Rollback Scenarios

### Scenario 1: Critical Bug Requiring Immediate Rollback

**Trigger**: Critical bug that prevents core functionality or causes data loss.

**Procedure**:
1. **Immediate Actions**:
   - Create a new release tag with the previous stable version
   - Example: If v1.0.1 has issues, create v1.0.0-rollback
   - Update appcast feeds to point to previous version
   - Publish updated feeds to gh-pages branch

2. **Communication**:
   - Update GitHub Release with warning notice
   - Add notice to release description about the issue
   - If applicable, notify users via issue tracker or announcements

3. **Steps**:
   ```bash
   # 1. Tag previous version as rollback
   git tag v1.0.0-rollback <previous-commit-sha>
   git push origin v1.0.0-rollback
   
   # 2. Update appcast feeds manually or via script
   # Remove problematic version from appcast
   # Point to previous stable version
   
   # 3. Publish updated feeds
   python scripts/publish_feeds.py \
     --appcasts updates/macos/stable/appcast.xml updates/windows/stable/appcast.xml \
     --message "Rollback to v1.0.0 due to critical bug"
   ```

### Scenario 2: Security Issue Requiring Rollback

**Trigger**: Security vulnerability discovered in released version.

**Procedure**:
1. **Immediate Actions**:
   - Remove problematic version from appcast feeds
   - Update feeds to point to last known secure version
   - Mark release as deprecated in GitHub

2. **Communication**:
   - Create security advisory in GitHub
   - Notify users immediately
   - Provide patch timeline if available

3. **Steps**:
   ```bash
   # 1. Remove version from appcast feeds
   # Edit appcast XML to remove problematic item
   
   # 2. Publish updated feeds
   python scripts/publish_feeds.py \
     --appcasts updates/macos/stable/appcast.xml updates/windows/stable/appcast.xml \
     --message "Security rollback: Remove v1.0.1"
   ```

### Scenario 3: Update Feed Issues

**Trigger**: Update feed corruption or incorrect URLs.

**Procedure**:
1. **Immediate Actions**:
   - Fix appcast XML files
   - Validate feeds
   - Republish to gh-pages branch

2. **Steps**:
   ```bash
   # 1. Fix appcast files
   # Edit XML files to correct issues
   
   # 2. Validate
   python scripts/validate_feeds.py
   
   # 3. Republish
   python scripts/publish_feeds.py \
     --appcasts updates/macos/stable/appcast.xml updates/windows/stable/appcast.xml \
     --message "Fix update feed issues"
   ```

---

## Rollback Procedures

### Quick Rollback (Update Feed Only)

If only the update feed needs to be rolled back (app still works, just prevent new installs):

1. **Edit Appcast Files**:
   - Remove problematic version entry from appcast XML
   - Keep previous stable version as latest

2. **Publish Updated Feeds**:
   ```bash
   python scripts/publish_feeds.py \
     --appcasts updates/macos/stable/appcast.xml updates/windows/stable/appcast.xml \
     --message "Rollback: Remove problematic version"
   ```

3. **Verify**:
   - Check feeds are accessible: `https://stuchain.github.io/CuePoint/updates/macos/stable/appcast.xml`
   - Verify feeds are valid: `python scripts/validate_feeds.py`

### Full Rollback (New Release)

If a new release is needed to replace the problematic one:

1. **Create Rollback Release**:
   ```bash
   # Tag previous stable version
   git tag v1.0.0-rollback <previous-commit-sha>
   git push origin v1.0.0-rollback
   ```

2. **Build and Release**:
   - GitHub Actions will automatically build and create release
   - Monitor workflows to ensure success

3. **Update Feeds**:
   - Feeds will be automatically updated by release workflow
   - Or manually update if needed

---

## Emergency Contacts

**Primary Contact**: Repository maintainer  
**Escalation**: GitHub repository administrators

---

## Prevention

To minimize rollback needs:

1. **Testing**:
   - Run full test suite before release
   - Test on clean systems
   - Verify update system works

2. **Staged Rollout** (Future):
   - Consider beta channel for testing
   - Gradual rollout to users

3. **Monitoring**:
   - Monitor error reports after release
   - Watch for user feedback
   - Track download statistics

---

## Post-Rollback Actions

After rolling back:

1. **Investigation**:
   - Identify root cause of issue
   - Document the problem
   - Create fix plan

2. **Fix Development**:
   - Develop fix in separate branch
   - Test thoroughly
   - Create new release with fix

3. **Communication**:
   - Update users on status
   - Provide timeline for fix
   - Apologize for inconvenience

---

## Notes

- Rollbacks should be rare but prepared for
- Always document rollback reasons
- Learn from rollback incidents to improve process
- Consider automated rollback triggers for critical errors (future enhancement)
