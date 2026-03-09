# Release Deployment Runbook

## Purpose

This runbook provides step-by-step instructions for deploying a CuePoint release. Follow these steps to ensure a safe, repeatable release.

## Prerequisites

- [ ] All tests passing (`pytest src/tests/`)
- [ ] Version synced in `src/cuepoint/version.py`, `pyproject.toml`
- [ ] Changelog updated in `docs/release/CHANGELOG.md`
- [ ] Release notes prepared

## Release Gates (Pre-Release)

1. **Verify release gates**:
   - Run `python scripts/check_release_readiness.py`
   - Ensure release gates workflow passes (version sync, changelog)
   - Run `pytest src/tests/ -v`

2. **Confirm build provenance**:
   - Commit SHA recorded
   - Build machine/tool versions documented

## Deployment Steps

### 1. Prepare Release Notes

- Update `docs/release/CHANGELOG.md` with all changes
- Use [Release Notes Template](release-notes-template.md)
- Include: highlights, fixes, known issues

### 2. Validate Artifacts

- Create release tag (e.g., `v1.2.3`)
- Trigger CI build (macOS, Windows)
- Verify artifacts:
  - Checksums valid
  - Signatures valid (macOS notarization, Windows code signing)
  - File sizes reasonable

### 3. Publish Release

- Create GitHub Release from tag
- Attach all platform artifacts
- Publish release notes
- Mark as latest (if stable)

### 4. Verify Appcast

- Appcast regenerated with new version
- Appcast URLs correct for macOS and Windows
- Update check returns new version
- Run `python scripts/check_appcast_diff.py` if available

### 5. Announce Release

- Post release announcement using [Release Announcement Template](release-announcement-template.md)
- Update GitHub Discussions if applicable
- Notify beta testers (if applicable)

## Post-Release Verification

- [ ] Download success (test download link)
- [ ] Install success (test on clean VM or machine)
- [ ] Update flow works (older version sees update)
- [ ] Release health: monitor issues for 24–48h

## Rollback

If the release is broken, follow the [Rollback Runbook](rollback.md).

## Related Documents

- [Release Strategy](release-strategy.md)
- [Release Schedule](release-schedule.md)
- [Rollback](rollback.md)
- [Update Feed Recovery Runbook](update-feed-recovery-runbook.md)
