# CuePoint Documentation

**Start here.** The map of where each kind of document lives.

CuePoint enriches Rekordbox playlists with Beatport metadata and keeps each match reviewable. It is an Electron desktop app with a Python engine, plus a Python CLI.

## Where things are

| Folder | What is in it | Who it is for |
| --- | --- | --- |
| [`user-guide/`](user-guide/getting-started.md) | How to use the app: install, import, match, review, discover, prepare, troubleshoot | Users |
| [`faq/`](faq/index.md) | Short answers, with links to the guide | Users and contributors |
| [`features/`](features/README.md) | How the CLI and matching pipeline are built: one page per feature, with code references | Contributors |
| [`development/`](development/architecture.md) | Setup, architecture, testing, match rules, Beatport parsing, the Beatport v4 reference | Contributors |
| [`release/`](release/release-deployment-runbook.md) | The release runbook, key management, rollback, incident response, the changelog | Maintainers |
| [`policy/`](policy/index.md) | Privacy, terms, telemetry, support, maintenance, deprecation and changelog policies | Everyone, and maintainers |
| [`compliance/`](compliance/privacy-compliance.md) | Privacy, licence and accessibility compliance | Maintainers |
| [`security/`](security/security-response-process.md) | Vulnerability reporting and patching | Reporters and maintainers |
| [`schema/`](schema/migration-guide.md) | Output schema migration and the Rekordbox compatibility matrix | Contributors |
| [`v1/`](v1/ROADMAP.md) and [`ui-overhaul/adr/`](ui-overhaul/README.md) | The design record: the roadmap, decisions, phase specs and the architecture decision records. History of why, not a how-to. | Contributors |

Where a page and the code disagree, the code is right: fix the page.

---

## User Documentation

For end users: installation, usage, troubleshooting.

| Section | Description |
| --- | --- |
| [Getting Started](user-guide/getting-started.md) | Install, first run, a first matched playlist, the CLI |
| [The CuePoint window](user-guide/the-window.md) | Navigation, search, Track Inspector, status strip, keyboard shortcuts |
| [Features](user-guide/features.md) | A tour of every page |
| [Your library](user-guide/library.md) | Importing and refreshing a Rekordbox collection, and what a refresh deletes |
| [Organizing your library](user-guide/organization.md) | Collections, Smart Collections, tags, ratings and changing many tracks at once |
| [Clean](user-guide/clean.md) | Matching on Beatport, review, missing files, duplicates and Health |
| [Discover](user-guide/discover.md) | New music from your artists and labels, the wantlist, Beatport playlists, a Beatport token |
| [Playing music](user-guide/player.md) | The player bar, queue and audio output |
| [Prepare](user-guide/prepare.md) | Sets: running orders in chapters, planned times, transition checks, suggestions, playing, set lists |
| [Waveforms](user-guide/waveforms.md) | Waveforms in the player bar, the Inspector, a Library column and Prepare's transition strip; the analysis and where its data lives |
| [Exporting to Rekordbox](user-guide/rekordbox-export.md) | Carrying your values and Collections back to Rekordbox, with cue points and beat grids kept |
| [Workflows](user-guide/workflows.md) | Common workflows |
| [Troubleshooting](user-guide/troubleshooting.md) | Common errors and fixes |
| [Glossary](user-guide/glossary.md) | Terms (candidate, confidence, etc.) |
| [FAQ](faq/index.md) | Frequently asked questions |
| [Support Policy](user-guide/support-policy.md) | Supported versions, support channels |

---

## Developer Documentation

For contributors: setup, architecture, extending the codebase.

| Section | Description |
| --- | --- |
| [Contributing](../.github/CONTRIBUTING.md) | How to contribute (start here) |
| [Architecture Overview](development/architecture.md) | The desktop process model, the matching pipeline, core services |
| [Feature internals](features/README.md) | How each CLI and pipeline feature is built |
| [Developer Setup](development/developer-setup.md) | Environment, running from source, scripts, tooling, coding standards |
| [Beatport v4 API Reference](development/beatport-v4-api.md) | The Beatport API routes, auth and errors that Discover uses |
| [Match Rules & Scoring](development/match-rules-and-scoring.md) | How to add match rules |
| [Beatport Parsing](development/beatport-parsing.md) | How to update Beatport parsing |
| [Testing Strategy](development/testing-strategy.md) | What tests to add and when |
| [Dev Sandbox](development/dev-sandbox.md) | Running against sample data |
| [Debug a Mismatch](development/debug-mismatch.md) | Step-by-step mismatch debugging |
| [Common Dev Errors](development/common-errors.md) | Dev environment troubleshooting |
| [Architecture decision records](ui-overhaul/README.md) | Index of the ADRs and the pixel-art assets |

---

## Release & Policy

| Section | Description |
| --- | --- |
| [Changelog](release/CHANGELOG.md) | Version history |
| [Release Deployment Runbook](release/release-deployment-runbook.md) | Versions, CI, signing, testing, publishing, templates |
| [Policy index](policy/index.md) | Every policy document |

---

## Compliance & Security

| Section | Description |
| --- | --- |
| [Privacy Compliance](compliance/privacy-compliance.md) | Data handling |
| [Security Response](security/security-response-process.md) | Vulnerability reporting |
| [License Compliance](compliance/license-compliance.md) | Third-party licences |

---

## Quick Links

- **New contributor?** → [Contributing](../.github/CONTRIBUTING.md) → [Developer Setup](development/developer-setup.md)
- **User issue?** → [Troubleshooting](user-guide/troubleshooting.md)

---

## For maintainers

Release and ops docs: the [Release Deployment Runbook](release/release-deployment-runbook.md) (versions, CI, signing, testing, publishing, templates, the Pages site, reproducible builds), [Key Management](release/key-management.md), [Rollback](release/rollback.md), [Incident Response](release/incident-response-runbook.md), the [Changelog Policy](policy/changelog-policy.md) and the [Support SLA](policy/support-sla.md).

### Who owns which docs

| Section | Owner | Review cadence |
| --- | --- | --- |
| User guide (`docs/user-guide/`) | Docs lead | Per release |
| Developer docs (`docs/development/`) | Eng lead | Per release |
| Release docs (`docs/release/`) | Release manager | Per release |
| Troubleshooting | Support and eng | Quarterly |
| Architecture | Eng lead | On major changes |

Update docs with the change that needs them: before or with the pull request for a major feature, with a migration note for a breaking change, and with the changelog, release notes and version references for a release. Review all docs for accuracy and broken links each quarter. A pull request that changes what users see should update the docs and the screenshots, and the changelog if it applies. CI runs a link checker (`.github/workflows/docs-check.yml`) over `docs/` and `.github/`; a broken link fails the build.
