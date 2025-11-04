# Design: PyPI Packaging

**Number**: 13  
**Status**: 📝 Planned  
**Priority**: 🚀 P2 - Larger Project  
**Effort**: 1 week  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

Installation requires cloning repo and manual setup. CLI users need an easy way to install and use the command-line version.

### 1.2 Solution Overview

Package for PyPI:
1. Create `pyproject.toml` (modern Python packaging)
2. Proper package structure
3. Build and upload to PyPI
4. Installable via `pip install cuepoint`
5. Command-line entry point

**Note:** This is primarily for CLI users. GUI users should use the standalone executables (see Design 17: Executable Packaging).

### 1.3 Use Cases

- **CLI Users**: Developers and power users who prefer command-line
- **Scripting**: Automated workflows and batch processing
- **Integration**: Programmatic access via Python API
- **Development**: Easy installation for contributors

---

## 2. Package Structure

### 2.1 Directory Layout

```
CuePoint/
├── pyproject.toml           # Package configuration
├── README.md                # Package description
├── LICENSE                   # License file
├── setup.py                  # Legacy setup (optional)
├── cuepoint/                 # Package directory
│   ├── __init__.py
│   ├── main.py              # CLI entry point
│   ├── config.py
│   ├── processor.py
│   └── ... (all SRC files)
├── tests/                    # Test suite
├── docs/                     # Documentation
└── scripts/                  # Utility scripts
```

### 2.2 Package Name

**PyPI Package**: `cuepoint` (or `cuepoint-enricher` if `cuepoint` is taken)

---

## 3. Package Configuration

### 3.1 pyproject.toml

**Location**: Root directory

```toml
[build-system]
requires = ["setuptools>=65.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "cuepoint"
version = "1.0.0"
description = "Rekordbox → Beatport Metadata Enricher"
readme = "README.md"
requires-python = ">=3.8"
license = {text = "MIT"}
authors = [
    {name = "Your Name", email = "your.email@example.com"}
]
keywords = ["rekordbox", "beatport", "music", "metadata", "matching"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: End Users/Desktop",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.8",
    "Programming Language :: Python :: 3.9",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Topic :: Multimedia :: Sound/Audio",
]

dependencies = [
    "requests>=2.31.0",
    "beautifulsoup4>=4.12.0",
    "rapidfuzz>=3.0.0",
    "tqdm>=4.64.0",
    "ddgs>=0.2.0",
    "python-dateutil>=2.8.0",
    "pyyaml>=6.0",
]

[project.optional-dependencies]
browser = [
    "playwright>=1.40.0",
    "selenium>=4.15.0",
]
gui = [
    "PySide6>=6.5.0",  # Optional GUI support
]
dev = [
    "pytest>=7.0.0",
    "pytest-cov>=4.0.0",
    "black>=23.0.0",
    "ruff>=0.1.0",
]

[project.scripts]
cuepoint = "cuepoint.main:main"

[project.urls]
Homepage = "https://github.com/yourusername/cuepoint"
Documentation = "https://github.com/yourusername/cuepoint#readme"
Repository = "https://github.com/yourusername/cuepoint"
Issues = "https://github.com/yourusername/cuepoint/issues"

[tool.setuptools]
packages = ["cuepoint"]

[tool.setuptools.package-data]
cuepoint = ["*.yaml", "*.md"]
```

### 3.2 Entry Point

**Location**: `cuepoint/main.py`

```python
#!/usr/bin/env python3
def main():
    """CLI entry point"""
    import sys
    from cuepoint.main import main as _main
    _main()

if __name__ == "__main__":
    main()
```

---

## 4. Building and Publishing

### 4.1 Build Package

```bash
# Install build tools
pip install build twine

# Build package
python -m build

# Creates dist/ directory with:
# - cuepoint-1.0.0.tar.gz (source distribution)
# - cuepoint-1.0.0-py3-none-any.whl (wheel)
```

### 4.2 Upload to PyPI

```bash
# Test on TestPyPI first
python -m twine upload --repository testpypi dist/*

# Install from TestPyPI
pip install --index-url https://test.pypi.org/simple/ cuepoint

# Upload to real PyPI
python -m twine upload dist/*
```

---

## 5. Installation and Usage

### 5.1 Installation

```bash
# Basic installation (CLI only)
pip install cuepoint

# With browser automation support
pip install cuepoint[browser]

# With GUI support (requires PySide6)
pip install cuepoint[gui]

# Development installation
pip install cuepoint[dev]
```

### 5.2 Usage

```bash
# After installation, use as command
cuepoint --xml collection.xml --playlist "My Playlist"

# Or still use as module
python -m cuepoint --xml collection.xml --playlist "My Playlist"

# Launch GUI (if GUI optional dependency installed)
cuepoint-gui
```

### 5.3 GUI vs CLI

- **Standalone Executable**: Recommended for GUI users (no Python needed)
- **PyPI Package**: Recommended for CLI users and developers
- **Both Use Same Core**: Same processing engine, different interfaces

---

## 6. Version Management

### 6.1 Semantic Versioning

- **MAJOR.MINOR.PATCH** (e.g., 1.0.0)
- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes

### 6.2 Version Location

```python
# cuepoint/__init__.py
__version__ = "1.0.0"
```

---

## 7. Documentation

### 7.1 README for PyPI

- **Description**: Clear project description
- **Installation**: pip install instructions
- **Usage**: Basic usage examples
- **Requirements**: Python version, dependencies
- **Links**: Homepage, documentation, repository

### 7.2 Long Description

```python
# In pyproject.toml
readme = "README.md"
# PyPI will render README.md as package description
```

---

## 8. Benefits

### 8.1 User Benefits

- **Easy installation**: Single pip command
- **No manual setup**: Automatic dependency installation
- **Version management**: Easy updates via pip

### 8.2 Developer Benefits

- **Distribution**: Easy to share and distribute
- **Standard packaging**: Follows Python best practices
- **CI/CD**: Can automate releases

---

## 9. Maintenance

### 9.1 Release Process

1. Update version in `__init__.py` and `pyproject.toml`
2. Update `CHANGELOG.md`
3. Build package: `python -m build`
4. Test installation: `pip install dist/*.whl`
5. Upload to PyPI: `python -m twine upload dist/*`
6. Create GitHub release

### 9.2 Automated Releases

```yaml
# .github/workflows/release.yml
name: Publish to PyPI
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
      - run: pip install build twine
      - run: python -m build
      - run: python -m twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_API_TOKEN }}
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

