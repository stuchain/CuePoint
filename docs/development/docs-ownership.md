# Documentation Ownership

Doc maintenance and review.

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
| User docs | `docs/user-guide/`, `docs/getting-started/` |
| Developer docs | `docs/development/` |
| Release docs | `docs/release/` |
| Policy | `docs/policy/` |
| Compliance | `docs/compliance/` |

## PR Checklist for Docs

- [ ] Docs updated for user-facing changes
- [ ] Screenshots updated if UI changed
- [ ] Links valid (no 404s)
- [ ] Changelog updated if applicable

## Link Checker

CI runs a link checker on docs. Broken links fail the build. See `.github/workflows/` for the `docs-check` or similar job.
