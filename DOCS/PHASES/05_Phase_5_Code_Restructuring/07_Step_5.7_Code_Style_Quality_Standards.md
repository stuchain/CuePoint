# Step 5.7: Code Style & Quality Standards

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: Step 5.1 (Project Structure)

---

## Goal

Ensure code follows PEP 8 standards and establish quality standards with automated tools. Set up code formatting, linting, and quality checks.

---

## Success Criteria

- [ ] Code formatter (black) configured and run
- [ ] Linter (pylint/flake8) configured and run
- [ ] Import sorter (isort) configured and run
- [ ] Type checker (mypy) configured and run
- [ ] All style issues fixed
- [ ] Pre-commit hooks set up
- [ ] IDE settings configured
- [ ] Coding standards documented
- [ ] .editorconfig created

---

## Tools Overview

### 5.7.1: Code Formatter: Black

**Purpose**: Automatically format code to PEP 8 style.

**Configuration**: `pyproject.toml`
```toml
[tool.black]
line-length = 100
target-version = ['py37']
include = '\.pyi?$'
exclude = '''
/(
    \.git
  | \.venv
  | venv
  | _build
  | dist
)/
'''
```

### 5.7.2: Linter: Pylint

**Purpose**: Check code quality and style issues.

**Configuration**: `.pylintrc`
```ini
[MASTER]
ignore=venv,env,.venv

[MESSAGES CONTROL]
disable=
    C0111,  # missing-docstring
    R0903,  # too-few-public-methods
    R0913,  # too-many-arguments

[FORMAT]
max-line-length=100

[BASIC]
good-names=i,j,k,ex,Run,_,id,db
```

### 5.7.3: Import Sorter: isort

**Purpose**: Sort and organize imports.

**Configuration**: `pyproject.toml`
```toml
[tool.isort]
profile = "black"
line_length = 100
multi_line_output = 3
include_trailing_comma = true
force_grid_wrap = 0
use_parentheses = true
ensure_newline_before_comments = true
skip_glob = ["*/migrations/*", "*/venv/*"]
```

### 5.7.4: Type Checker: Mypy

**Purpose**: Static type checking.

**Configuration**: `mypy.ini` (see Step 5.5)

---

## Setup and Configuration

### 5.7.5: Install Tools

**requirements-dev.txt:**
```
black>=23.0.0
pylint>=2.17.0
isort>=5.12.0
mypy>=1.0.0
flake8>=6.0.0
pre-commit>=3.0.0
```

### 5.7.6: EditorConfig

**.editorconfig:**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 4

[*.{yml,yaml}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

---

## Pre-commit Hooks

### 5.7.7: Pre-commit Configuration

**.pre-commit-config.yaml:**
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-json
      - id: check-toml
      - id: check-merge-conflict
      - id: debug-statements

  - repo: https://github.com/psf/black
    rev: 23.3.0
    hooks:
      - id: black
        language_version: python3.7

  - repo: https://github.com/pycqa/isort
    rev: 5.12.0
    hooks:
      - id: isort
        args: ["--profile", "black"]

  - repo: https://github.com/pycqa/flake8
    rev: 6.0.0
    hooks:
      - id: flake8
        args: [--max-line-length=100, --extend-ignore=E203]

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.3.0
    hooks:
      - id: mypy
        additional_dependencies: [types-all]
        args: [--ignore-missing-imports]
```

### 5.7.8: Install Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run hooks manually
pre-commit run --all-files
```

---

## Code Style Guidelines

### 5.7.9: PEP 8 Compliance

**Key Rules:**
- Maximum line length: 100 characters
- Use 4 spaces for indentation
- Use blank lines to separate functions and classes
- Use descriptive variable names
- Follow naming conventions:
  - Functions: `snake_case`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Private: `_leading_underscore`

### 5.7.10: Import Organization

**Order:**
1. Standard library imports
2. Third-party imports
3. Local application imports

**Example:**
```python
# Standard library
import os
import sys
from pathlib import Path
from typing import List, Dict, Optional

# Third-party
from PySide6.QtWidgets import QMainWindow, QWidget
import requests

# Local
from cuepoint.core.matcher import best_beatport_match
from cuepoint.services.processor_service import ProcessorService
```

### 5.7.11: Function and Class Documentation

**Functions:**
- Use docstrings for all public functions
- Keep functions focused (single responsibility)
- Limit function length (< 50 lines ideally)

**Classes:**
- Use docstrings for all classes
- Keep classes focused
- Use composition over inheritance when possible

### 5.7.12: Naming Conventions

```python
# Good
def process_track(track: Track) -> TrackResult:
    """Process a track."""
    pass

class TrackProcessor:
    """Processor for tracks."""
    pass

MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Bad
def proc(t: Track):  # Too short, no type hints
    pass

class track_processor:  # Wrong case
    pass
```

---

## Running Quality Checks

### 5.7.13: Manual Commands

```bash
# Format code
black src/cuepoint

# Check formatting (dry run)
black --check src/cuepoint

# Sort imports
isort src/cuepoint

# Check imports (dry run)
isort --check-only src/cuepoint

# Run linter
pylint src/cuepoint

# Run type checker
mypy src/cuepoint

# Run all checks
black --check src/cuepoint && \
isort --check-only src/cuepoint && \
pylint src/cuepoint && \
mypy src/cuepoint
```

### 5.7.14: Makefile for Quality Checks

**Makefile:**
```makefile
.PHONY: format lint type-check quality-check

format:
	black src/cuepoint
	isort src/cuepoint

lint:
	pylint src/cuepoint
	flake8 src/cuepoint

type-check:
	mypy src/cuepoint

quality-check: format lint type-check
	@echo "All quality checks passed!"

check-format:
	black --check src/cuepoint
	isort --check-only src/cuepoint
```

---

## IDE Configuration

### 5.7.15: VS Code Settings

**.vscode/settings.json:**
```json
{
    "python.formatting.provider": "black",
    "python.linting.enabled": true,
    "python.linting.pylintEnabled": true,
    "python.linting.mypyEnabled": true,
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.organizeImports": true
    },
    "[python]": {
        "editor.defaultFormatter": "ms-python.black-formatter",
        "editor.rulers": [100]
    }
}
```

### 5.7.16: PyCharm Configuration

1. **Black Formatter**:
   - Settings → Tools → Black
   - Enable "On code reformat"
   - Set line length to 100

2. **Pylint**:
   - Settings → Tools → External Tools
   - Add pylint as external tool

3. **isort**:
   - Settings → Tools → Actions on Save
   - Enable "Optimize imports"

---

## Quality Metrics

### 5.7.17: Code Quality Targets

- **Cyclomatic Complexity**: < 10 per function
- **Function Length**: < 50 lines
- **Class Length**: < 500 lines
- **Import Count**: < 20 per file
- **Pylint Score**: > 8.0/10

### 5.7.18: Measuring Quality

```bash
# Install radon for complexity metrics
pip install radon

# Calculate complexity
radon cc src/cuepoint

# Calculate maintainability index
radon mi src/cuepoint

# Generate HTML report
radon cc src/cuepoint --html > complexity_report.html
```

---

## Common Style Issues and Fixes

### 5.7.19: Long Lines
**Fix**: Break into multiple lines or extract to function
```python
# Bad
result = process_track(track, options={"include_candidates": True, "min_confidence": 0.7, "max_results": 10})

# Good
result = process_track(
    track,
    options={
        "include_candidates": True,
        "min_confidence": 0.7,
        "max_results": 10
    }
)
```

### 5.7.20: Too Many Parameters
**Fix**: Use dataclass or dictionary
```python
# Bad
def process_track(title, artist, album, duration, bpm, key, year):
    pass

# Good
@dataclass
class Track:
    title: str
    artist: str
    album: str
    duration: float
    bpm: Optional[float] = None
    key: Optional[str] = None
    year: Optional[int] = None

def process_track(track: Track):
    pass
```

### 5.7.21: Unused Imports
**Fix**: Remove or use isort to clean up
```bash
isort --remove-unused-imports src/cuepoint
```

---

## Implementation Checklist

- [ ] Install code quality tools
- [ ] Configure black (`pyproject.toml`)
- [ ] Configure pylint (`.pylintrc`)
- [ ] Configure isort (`pyproject.toml`)
- [ ] Configure mypy (`mypy.ini`)
- [ ] Create `.editorconfig`
- [ ] Create `.pre-commit-config.yaml`
- [ ] Install pre-commit hooks
- [ ] Format all code with black
- [ ] Sort all imports with isort
- [ ] Fix all linting errors
- [ ] Fix all type checking errors
- [ ] Configure IDE settings
- [ ] Document coding standards
- [ ] Run quality checks in CI/CD
- [ ] Review code quality metrics

---

## Coding Standards Document

**docs/development/coding_standards.md:**
```markdown
# Coding Standards

## Style Guide
- Follow PEP 8
- Use black for formatting
- Maximum line length: 100 characters

## Naming Conventions
- Functions: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

## Documentation
- All public functions must have docstrings
- Use Google-style docstrings
- Include type hints

## Quality Targets
- Pylint score: > 8.0
- Cyclomatic complexity: < 10
- Test coverage: > 80%
```

---

## Next Steps

After completing this step:
1. Verify all code is formatted
2. Verify all linting errors fixed
3. Set up CI/CD quality checks
4. Proceed to Step 5.8: Configuration Management

