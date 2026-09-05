# License Compliance

## Overview

CuePoint’s own source code is licensed under the **Apache License, Version 2.0** (`LICENSE` at the repository root). Dependencies and bundled libraries must use terms **compatible** with that license.

This document outlines the license compliance process for CuePoint, ensuring all third-party dependencies are properly licensed and documented.

## Bundled binary components

The tooling below (`analyze_licenses.py`, `validate_licenses.py`, `generate_licenses.py`) reads
**pip metadata**, so it sees Python dependencies and nothing else. CuePoint also ships binaries it
did not build, which no Python tool can see. Those are covered by
`python scripts/check_bundled_licenses.py`, which runs in the `license-compliance` and
`desktop-electron` workflows.

| Component | Licence | How it is used | Where it is recorded |
| --- | --- | --- | --- |
| mpv (player sidecar) | **GPL-2.0-or-later** | Unmodified binary, run as a separate child process, controlled over mpv's own JSON IPC protocol | `third_party/mpv/NOTICE.md`, `scripts/player_sidecar_manifest.json`, ADR-004 |

**On the copyleft check below.** "Check for copyleft licenses (GPL, AGPL)" does not mean copyleft
is forbidden; it means it requires a deliberate decision recorded somewhere a future reader will
find. mpv is that case, decided in DEC-005/DEC-049 and analysed in
`docs/ui-overhaul/adr/004-player-backend.md`. It is compatible with CuePoint's Apache-2.0 licence
because mpv is **aggregated, not incorporated**: it is a separate program in a separate process,
communicating over a published IPC interface, with no linking in either direction. Distributing it
obliges CuePoint to ship its licence texts and to identify the corresponding source, both of which
are automated and gated.

The line that must not be crossed without a new decision is **linking**. Loading libmpv into
CuePoint's own process — a native addon, or a wrapper we build — changes the analysis entirely and
was rejected for this reason among others.

## Compliance Process

### Regular Audits

1. **Weekly Audits**
   - Run license validation script: `python scripts/validate_licenses.py`
   - Review license changes
   - Update license file if needed
   - Document any issues

2. **Monthly Audits**
   - Comprehensive license review
   - Verify all licenses are documented
   - Check for license compatibility
   - Update THIRD_PARTY_LICENSES.txt

3. **Quarterly Audits**
   - Full license audit
   - Review license compatibility
   - Update compliance documentation
   - Report compliance status

### New Dependencies

When adding a new dependency:

1. **Check License Before Adding**
   - Review dependency license
   - Verify license compatibility
   - Check license restrictions
   - Document license

2. **Verify License Compatibility**
   - Ensure license is compatible with project license
   - Check for copyleft licenses (GPL, AGPL) — permitted only for a *separate process* bundled
     as a binary, with an ADR recording the analysis (see "Bundled binary components"); never for
     anything linked into CuePoint's own process
   - Verify commercial use is allowed
   - Confirm redistribution is allowed

3. **Document License**
   - Add to requirements file
   - Run license validation
   - Update license file
   - Document in changelog

### License Updates

When dependencies are updated:

1. **Monitor License Changes**
   - Check for license changes in updates
   - Review changelog for license updates
   - Verify compatibility still holds
   - Update documentation if needed

2. **Update License File**
   - Regenerate license file: `python scripts/generate_licenses.py`
   - Review generated file
   - Update THIRD_PARTY_LICENSES.txt
   - Commit changes

## License Validation

### Automated Validation

License validation is automated via:

1. **CI/CD Pipeline**
   - Runs on every PR
   - Validates all dependencies
   - Fails build on unknown licenses
   - Generates compliance report

2. **Validation Script**
   ```bash
   python scripts/validate_licenses.py --requirements requirements-build.txt
   ```

3. **Compliance Check**
   ```bash
   python scripts/validate_compliance.py
   ```

### Manual Validation

For manual validation:

1. **Run Validation Script**
   ```bash
   python scripts/validate_licenses.py
   ```

2. **Review Output**
   - Check for unknown licenses
   - Verify license compatibility
   - Review license restrictions

3. **Generate License File**
   ```bash
   python scripts/generate_licenses.py --output THIRD_PARTY_LICENSES.txt
   ```

## Compliance Checklist

### Pre-Release Checklist

- [ ] All licenses are documented
- [ ] License file is up-to-date
- [ ] License compatibility verified
- [ ] License validation passes
- [ ] THIRD_PARTY_LICENSES.txt is current
- [ ] No unknown licenses
- [ ] No incompatible licenses

### Ongoing Compliance

- [ ] Weekly license validation runs
- [ ] Monthly comprehensive review
- [ ] Quarterly full audit
- [ ] License file updated regularly
- [ ] Compliance issues tracked
- [ ] Compliance reports generated

## License Types

### Permissive Licenses (Allowed)

- MIT
- Apache 2.0
- BSD (2-Clause, 3-Clause)
- ISC
- Python Software Foundation License

### Copyleft Licenses (Require Review)

- GPL (v2, v3)
- AGPL (v3)
- LGPL (v2, v3)
- MPL (v2)

**Note**: Copyleft licenses require careful review to ensure compliance.

### Prohibited Licenses

- No commercial use licenses
- No redistribution licenses
- Proprietary licenses (unless explicitly approved)

## License File

### THIRD_PARTY_LICENSES.txt

The license file contains:
- All third-party dependencies
- License information for each dependency
- License text (where applicable)
- Version information

### Generating License File

```bash
python scripts/generate_licenses.py --output THIRD_PARTY_LICENSES.txt
```

### Updating License File

1. Run generation script
2. Review generated file
3. Commit to repository
4. Include in releases

## Compliance Reporting

### Weekly Reports

- License validation results
- New dependencies added
- License changes detected
- Compliance status

### Monthly Reports

- Comprehensive license audit
- Compliance metrics
- Issues and resolutions
- Recommendations

### Quarterly Reports

- Full compliance review
- License compatibility analysis
- Compliance trends
- Strategic recommendations

## Related Documents

- [Privacy Compliance](privacy-compliance.md)
- [Accessibility Compliance](accessibility-compliance.md)
- [Security Response Process](../security/security-response-process.md)

## Last Updated

2025-01-XX

