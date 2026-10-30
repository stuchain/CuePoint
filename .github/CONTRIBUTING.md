# Contributing to CuePoint

Thanks for helping improve CuePoint. Design 10.41.

## How to Contribute

- **Bugs**: Use the [Bug Report template](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml)
- **Features**: Use the [Feature Request template](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml)
- **Code**: Fork, branch, make changes, and open a PR

## Quick Start (New Contributors)

1. **Clone and setup** (target: under 30 minutes):
   ```bash
   git clone https://github.com/stuchain/CuePoint.git
   cd CuePoint
   python scripts/dev_setup.py
   ```
2. **Activate venv**:
   - Windows: `.venv\Scripts\activate`
   - macOS/Linux: `source .venv/bin/activate`
3. **Run the app**: `cd apps/desktop-electron && npm ci && npm ci --prefix renderer && npm run electron:start`
4. **Run tests**: `python scripts/run_tests.py --unit`

See [Developer Setup](https://github.com/stuchain/CuePoint/blob/main/docs/development/developer-setup.md) for details.

## Dev Setup (Manual)

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
```

## Contributor Checklist (PR Quality Gates)

Before opening a PR, ensure:

- [ ] **Tests**: Added or updated for new/changed logic
- [ ] **Docs**: Updated for user-facing changes
- [ ] **Lint and format**: `ruff check src/` and `ruff format --check src/` pass
- [ ] **Types**: `python -m pytest src/tests/integration/test_mypy_foundation.py -q` passes (the mypy gate)
- [ ] **Renderer**: for UI changes, `npm run lint`, `npm run typecheck` and `npm test` pass in `apps/desktop-electron/renderer`
- [ ] **Changelog**: Updated in `docs/release/CHANGELOG.md` for notable changes

## Coding Standards

- **Formatting and linting**: Ruff (`ruff format`, `ruff check`)
- **Typing**: Type hints for public APIs
- **Testing**: Unit tests for new logic; regression tests for bug fixes

See [Coding Standards](https://github.com/stuchain/CuePoint/blob/main/docs/development/developer-setup.md#coding-standards).

**Documentation:** [docs/README.md](https://github.com/stuchain/CuePoint/blob/main/docs/README.md) — single entry point for all docs.

## Contribution Flow

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Implement changes
4. Run tests: `python scripts/run_tests.py --all --no-slow`
5. Open a PR with the checklist above

## Documentation

- **Start here**: [docs/README.md](https://github.com/stuchain/CuePoint/blob/main/docs/README.md)
- **Architecture**: [docs/development/architecture.md](https://github.com/stuchain/CuePoint/blob/main/docs/development/architecture.md)
- **Match rules**: [docs/development/match-rules-and-scoring.md](https://github.com/stuchain/CuePoint/blob/main/docs/development/match-rules-and-scoring.md)

## Community

### Taking Part in the Community

- **Ask questions** in [GitHub Discussions](https://github.com/stuchain/CuePoint/discussions). Search first, and give context and details.
- **Share ideas** there too. Explain the problem and what you propose, be open to feedback, and consider alternatives.
- **Help others.** Answer when you can, be patient with newcomers, and give constructive feedback.
- **Report bugs** in [GitHub Issues](https://github.com/stuchain/CuePoint/issues) with the issue templates. Include the steps to reproduce.
- **Report security problems** as described in the [Security Policy](SECURITY.md), not in a public discussion.

Before you post, search for an existing discussion or issue, check the [FAQ](../docs/faq/index.md) and the [documentation](../docs/README.md), gather the details, and keep the post clear and short. When you reply, be helpful and respectful, give examples where you can, and link to relevant resources.

### Moderation

We keep the community respectful and inclusive. Moderators may remove inappropriate content, warn or ban people who break the [Code of Conduct](CODE_OF_CONDUCT.md), close discussions that do not follow these guidelines, and take other steps as needed.

### Contributor Expectations

1. **Code of Conduct**: All contributors must adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).
2. **Quality**: Follow the contributor checklist (tests, docs, lint, changelog) above.
3. **License**: By contributing, you agree that your contributions will be licensed under the **Apache License, Version 2.0**, the same terms as the project (`LICENSE` at the repository root).

### Maintainer Expectations

1. **Review**: We aim to review PRs within a reasonable timeframe (see [Support SLA](../docs/policy/support-sla.md) for response targets).
2. **Feedback**: We provide constructive feedback and guidance.
3. **Attribution**: Contributors are credited in release notes and the changelog.

### Contribution Types

| Type | Process | Response Target |
| --- | --- | --- |
| Bug report | Issue template | Per Support SLA (P1/P2) |
| Feature request | Issue template | Per Support SLA (P2) |
| Pull request | PR + review | Best effort, typically within 5 days |
| Documentation | PR to docs/ | Same as code PRs |

### Intellectual Property

- Contributions are made under the **Apache License, Version 2.0**.
- You retain copyright; by submitting a PR, you grant the project a license to use, modify, and distribute your contribution.
