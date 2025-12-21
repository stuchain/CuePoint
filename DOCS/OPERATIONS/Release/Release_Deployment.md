# Release Deployment Runbook

## Purpose
Deploy a new release to production.

## Prerequisites
- Release is tested and approved
- Release tag is created
- Release notes are prepared
- All tests pass

## Steps

### Step 1: Pre-Deployment Checks
1. Verify all tests pass
2. Verify release notes are complete
3. Verify version number is correct
4. Verify changelog is updated
5. Verify documentation is updated

### Step 2: Create Release Tag
1. Create release tag: `git tag v1.0.0`
2. Push tag: `git push origin v1.0.0`
3. Verify tag is created on GitHub

### Step 3: Trigger Release Workflow
1. GitHub Actions will automatically:
   - Build artifacts for all platforms
   - Sign and notarize (macOS)
   - Create release on GitHub
   - Upload artifacts

### Step 4: Verify Release
1. Check GitHub Releases page
2. Verify all artifacts are uploaded
3. Verify release notes are correct
4. Test download links

### Step 5: Announce Release
1. Update release notes if needed
2. Announce on GitHub Discussions
3. Update documentation if needed

## Verification
- [ ] Release tag created
- [ ] All artifacts built successfully
- [ ] Release published on GitHub
- [ ] Download links work
- [ ] Release notes are accurate

## Troubleshooting

### Issue: Build Fails
**Symptoms**: GitHub Actions workflow fails
**Cause**: Build errors, test failures, or configuration issues
**Solution**: 
1. Check workflow logs
2. Fix errors
3. Re-run workflow

### Issue: Artifacts Missing
**Symptoms**: Some platform artifacts not uploaded
**Cause**: Build failure for specific platform
**Solution**:
1. Check platform-specific build logs
2. Fix platform-specific issues
3. Re-run workflow

### Issue: Release Not Created
**Symptoms**: Tag exists but release not created
**Cause**: Workflow failure or permissions issue
**Solution**:
1. Check workflow permissions
2. Manually create release if needed
3. Upload artifacts manually

## Related Procedures
- [Rollback Procedure](Rollback_Procedure.md)
- [Hotfix Release](Hotfix_Release.md)

## Last Updated
2025-12-16

