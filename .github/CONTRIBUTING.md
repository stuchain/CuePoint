# Contributing to CuePoint

Thank you for your interest in contributing to CuePoint! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Use the [Bug Report template](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml)
3. Provide detailed information:
   - Steps to reproduce
   - Expected vs actual behavior
   - System information
   - Screenshots if applicable

### Suggesting Features

1. Check if the feature has already been suggested
2. Use the [Feature Request template](https://github.com/stuchain/CuePoint/issues/new?template=feature_request.yml)
3. Explain the problem and proposed solution
4. Consider alternatives

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write or update tests
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

### Prerequisites

- Python 3.11+
- Git
- PySide6
- See `requirements.txt` for full list

### Setup Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/stuchain/CuePoint.git
   cd CuePoint
   ```

2. Create virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

4. Run tests:
   ```bash
   pytest
   ```

## Coding Standards

### Python Style

- Follow PEP 8
- Use type hints
- Write docstrings
- Keep functions focused

### Code Quality

- Write tests for new features
- Ensure code coverage > 80%
- Run linters before committing
- Follow existing code patterns

### Commit Messages

- Use clear, descriptive messages
- Reference issues when applicable
- Follow conventional commits format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation
  - `test:` for tests
  - `refactor:` for refactoring

## Testing

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=cuepoint --cov-report=html

# Run specific test file
pytest SRC/tests/unit/utils/test_error_reporter.py
```

### Writing Tests

- Write tests for all new features
- Test edge cases
- Use fixtures for common setup
- Mock external dependencies

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers
6. Address review feedback
7. Wait for approval before merging

## Code Review

- All PRs require review
- Be open to feedback
- Respond to comments promptly
- Make requested changes

## Questions?

- Ask in [GitHub Discussions](https://github.com/stuchain/CuePoint/discussions)
- Check [Documentation](https://stuchain.github.io/CuePoint/)
- Read [Community Guidelines](COMMUNITY_GUIDELINES.md)

Thank you for contributing to CuePoint!

