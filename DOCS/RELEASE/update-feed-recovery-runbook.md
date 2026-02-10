# Update Feed Recovery Runbook

## Purpose

When the appcast (update feed) is invalid, corrupted, or missing, follow this runbook to recover and restore the update flow.

## Symptoms

- Users report "Update check failed"
- Appcast URL returns 404 or invalid XML
- Update check returns wrong or no version
- Signature verification fails on update

## Prerequisites

- Access to appcast host (e.g., `gh-pages` branch, CDN)
- Release artifacts (installers) available and valid
- Checksums and signatures for artifacts

## Recovery Steps

### 1. Validate Appcast

- Fetch appcast URL and verify it returns valid XML
- Check structure: `<rss>`, `<channel>`, `<item>` entries
- Verify each `<item>` has: `title`, `enclosure` (url, length, type), `sparkle:version` (if Sparkle)

### 2. Identify Issue

| Issue | Cause | Fix |
| --- | --- | --- |
| 404 | Appcast not published or wrong path | Re-publish appcast |
| Invalid XML | Malformed or truncated | Regenerate appcast |
| Wrong version | Stale cache or wrong entry | Update appcast, clear cache |
| Signature fail | Notarization/signing issue | Re-sign, update appcast |

### 3. Rebuild Feed

- Use release workflow or script to regenerate appcast
- Ensure all required fields populated
- Validate XML syntax (e.g., `xmllint` or online validator)

### 4. Re-Publish

- Push updated appcast to host (e.g., `gh-pages`)
- Verify URL is accessible
- Clear any CDN cache if applicable

### 5. Verify

- Run app's update check from previous version
- Confirm new version is offered
- Test download and install flow
- Run `python scripts/check_appcast_diff.py` if available

## Appcast Locations

- **macOS**: `updates/macos/stable/appcast.xml` (or as configured)
- **Windows**: `updates/windows/stable/appcast.xml` (or as configured)

## Validation Checklist

- [ ] Appcast URL returns 200
- [ ] XML is well-formed
- [ ] Latest version entry correct
- [ ] Enclosure URLs valid and downloadable
- [ ] Signatures/checksums match artifacts
- [ ] Update check from app succeeds

## Related Documents

- [Release Deployment Runbook](release-deployment-runbook.md)
- [Rollback](rollback.md)
- [Incident Response Runbook](incident-response-runbook.md)
