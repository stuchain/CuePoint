# Compatibility Matrix — CuePoint

**Long-term maintenance and evolution**  
**Version 1.0 — 2026-02-04**  
**Last updated**: 2026-02-04

## Overview

This document tracks supported and tested operating systems, Python versions, and Rekordbox XML formats. It is updated with each release.

## Operating Systems

| OS | Version | Status | Notes |
| --- | --- | --- | --- |
| **Windows** | 10 | Supported | CI tested |
| **Windows** | 11 | Supported | CI tested |
| **macOS** | 12 (Monterey) | Supported | CI tested |
| **macOS** | 13 (Ventura) | Supported | CI tested |
| **macOS** | 14 (Sonoma) | Experimental | Report issues |
| **Linux** | Ubuntu 22.04 | Experimental | Community tested |
| **Linux** | Ubuntu 24.04 | Experimental | Community tested |

### Status Definitions

- **Supported**: Actively tested in CI; recommended for production use.
- **Experimental**: May work; report issues; not guaranteed.
- **Unsupported**: Not tested; use at your own risk.

## Python Versions

| Python | Status | Notes |
| --- | --- | --- |
| 3.11 | Supported | Primary; CI tested |
| 3.12 | Experimental | May work; report issues |
| 3.13 | Experimental | May work; report issues |
| 3.10 | Unsupported | EOL; upgrade recommended |
| 3.9 and earlier | Unsupported | Not tested |

## Rekordbox XML Versions

See [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md) for detailed XML schema support.

| Rekordbox | XML Version | Status |
| --- | --- | --- |
| 5.x | v1 | Supported |
| 6.0–6.9 | v1 | Supported |
| 7.0 | v2 | Experimental |

## CI Test Matrix

The following combinations are tested in CI (`test.yml`):

| OS | Python |
| --- | --- |
| windows-latest | 3.11 |
| macos-latest | 3.11 |

## Compatibility Testing Schedule

- **Before each major release**: Run full test suite on supported OS/Python.
- **New OS betas**: Test when available; update matrix before GA.
- **New Rekordbox versions**: Validate XML parsing; update matrix.

## Adding Support for New Versions

1. Run integration tests with sample XML.
2. Update this matrix.
3. Update [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md) if applicable.
4. Document any known quirks.
5. Add to release notes.

## Related Documents

- [Maintenance Policy](maintenance-policy.md)
- [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md)
- [Support Policy](../user-guide/support-policy.md)
