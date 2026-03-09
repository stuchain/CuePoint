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
3. **Run the app**: `python src/gui_app.py`
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
- [ ] **Lint**: `ruff check src/` passes
- [ ] **Types**: `mypy src/ --ignore-missing-imports` passes (or known issues documented)
- [ ] **Changelog**: Updated in `docs/release/CHANGELOG.md` for notable changes

## Coding Standards

- **Formatting**: Black (line length 100), isort
- **Linting**: Ruff, pylint (errors only)
- **Typing**: Type hints for public APIs
- **Testing**: Unit tests for new logic; regression tests for bug fixes

See [Coding Standards](https://github.com/stuchain/CuePoint/blob/main/docs/development/coding-standards.md).

**Documentation:** [docs/README.md](https://github.com/stuchain/CuePoint/blob/main/docs/README.md) — single entry point for all docs.

## Contribution Flow

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Implement changes
4. Run tests: `python scripts/run_tests.py --all`
5. Open a PR with the checklist above

## Documentation

- **Start here**: [docs/README.md](https://github.com/stuchain/CuePoint/blob/main/docs/README.md)
- **Architecture**: [docs/development/architecture.md](https://github.com/stuchain/CuePoint/blob/main/docs/development/architecture.md)
- **Match rules**: [docs/development/match-rules-and-scoring.md](https://github.com/stuchain/CuePoint/blob/main/docs/development/match-rules-and-scoring.md)
