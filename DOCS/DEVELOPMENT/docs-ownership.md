# Documentation Ownership

Design 10.10, 10.50. Doc maintenance and review.

## Ownership Matrix

| Section | Owner | Review Cadence |
| --- | --- | --- |
| User Guide | Docs lead | Per release |
| Developer Guide | Eng lead | Per release |
| Release Docs | Release manager | Per release |
| Troubleshooting | Support / Eng | Quarterly |
| Architecture | Eng lead | On major changes |

## Update Policy

- **Major feature**: Update relevant docs before or with the PR
- **Breaking change**: Add migration guide or update existing
- **Release**: Update changelog, release notes, version references
- **Quarterly**: Review all docs for accuracy and broken links

## Doc Locations

| Area | Path |
| --- | --- |
| User docs | `DOCS/user-guide/`, `DOCS/getting-started/` |
| Developer docs | `DOCS/DEVELOPMENT/` |
| Release docs | `DOCS/RELEASE/` |
| Policy | `DOCS/POLICY/` |
| Compliance | `DOCS/COMPLIANCE/` |

## PR Checklist for Docs

- [ ] Docs updated for user-facing changes
- [ ] Screenshots updated if UI changed
- [ ] Links valid (no 404s)
- [ ] Changelog updated if applicable

## Link Checker

CI runs a link checker on docs. Broken links fail the build. See `.github/workflows/` for the `docs-check` or similar job.
