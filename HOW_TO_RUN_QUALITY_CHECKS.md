# How to Run Quality Checks - Step 5.7

This guide shows you how to run all the quality tools and tests on your own.

## Prerequisites

Make sure you have all the development dependencies installed:

```bash
pip install -r requirements-dev.txt
```

This installs:
- black (code formatter)
- isort (import sorter)
- pylint (linter)
- flake8 (linter)
- mypy (type checker)
- pytest (test framework)
- pre-commit (git hooks)
- radon (complexity metrics)

---

## Method 1: Using Makefile (Easiest)

The Makefile provides convenient shortcuts for all quality checks.

### Format Code
```bash
make format
```
This runs both Black and isort to format your code.

### Check Formatting (without modifying files)
```bash
make check-format
```
This checks if code is properly formatted without making changes.

### Run Linters
```bash
make lint
```
This runs both Pylint and Flake8.

### Type Checking
```bash
make type-check
```
This runs Mypy type checker.

### Run All Quality Checks
```bash
make quality-check
```
This runs format, lint, and type-check in sequence.

---

## Method 2: Running Tools Individually

### Black (Code Formatter)

**Format code:**
```bash
python -m black SRC/cuepoint
```

**Check formatting (dry run):**
```bash
python -m black --check SRC/cuepoint
```

**Format specific file:**
```bash
python -m black src/cuepoint/services/interfaces.py
```

**Check specific file:**
```bash
python -m black --check src/cuepoint/services/interfaces.py
```

### isort (Import Sorter)

**Sort imports:**
```bash
python -m isort SRC/cuepoint
```

**Check imports (dry run):**
```bash
python -m isort --check-only SRC/cuepoint
```

**Sort specific file:**
```bash
python -m isort src/cuepoint/services/interfaces.py
```

**Remove unused imports:**
```bash
python -m isort --remove-unused-imports SRC/cuepoint
```

### Pylint (Linter)

**Run on entire codebase:**
```bash
python -m pylint SRC/cuepoint
```

**Run on specific file:**
```bash
python -m pylint src/cuepoint/services/interfaces.py
```

**Get score only:**
```bash
python -m pylint SRC/cuepoint --score=y
```

**Disable specific warnings:**
```bash
python -m pylint SRC/cuepoint --disable=C0111,R0903
```

### Flake8 (Linter)

**Run on entire codebase:**
```bash
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
```

**Run on specific file:**
```bash
python -m flake8 src/cuepoint/services/interfaces.py --max-line-length=100
```

**Show statistics:**
```bash
python -m flake8 SRC/cuepoint --statistics --max-line-length=100
```

### Mypy (Type Checker)

**Run on entire codebase:**
```bash
python -m mypy SRC/cuepoint
```

**Run on specific file:**
```bash
python -m mypy src/cuepoint/services/interfaces.py
```

**Show error codes:**
```bash
python -m mypy SRC/cuepoint --show-error-codes
```

**Strict mode:**
```bash
python -m mypy SRC/cuepoint --strict
```

---

## Running Tests

### Step 5.7 Test Suite

**Run all Step 5.7 tests:**
```bash
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py -v
```

**Run specific test class:**
```bash
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py::TestConfigurationFiles -v
```

**Run specific test:**
```bash
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py::TestConfigurationFiles::test_editorconfig_exists -v
```

### All Project Tests

**Run all tests:**
```bash
python -m pytest SRC/tests/ -v
```

**Run with coverage:**
```bash
python -m pytest SRC/tests/ --cov=SRC/cuepoint --cov-report=html
```

**Run specific test directory:**
```bash
python -m pytest SRC/tests/unit/ -v
python -m pytest SRC/tests/integration/ -v
python -m pytest SRC/tests/ui/ -v
```

**Run tests in parallel (faster):**
```bash
python -m pytest SRC/tests/ -n auto
```

**Stop on first failure:**
```bash
python -m pytest SRC/tests/ -x
```

---

## Complete Workflow Examples

### Before Committing Code

```bash
# 1. Format code
make format

# 2. Check formatting
make check-format

# 3. Run linters
make lint

# 4. Type check
make type-check

# 5. Run tests
python -m pytest SRC/tests/ -v
```

Or use the all-in-one command:
```bash
make quality-check
python -m pytest SRC/tests/ -v
```

### Quick Check (Fast)

```bash
# Just check formatting and run quick tests
make check-format
python -m pytest SRC/tests/unit/ -v
```

### Full Quality Check (Comprehensive)

```bash
# Format code
make format

# Run all linters
make lint

# Type check
make type-check

# Run all tests with coverage
python -m pytest SRC/tests/ --cov=SRC/cuepoint --cov-report=term-missing

# Check code complexity (optional)
python -m radon cc SRC/cuepoint
python -m radon mi SRC/cuepoint
```

---

## Understanding Output

### Black
- **Exit code 0**: Code is properly formatted
- **Exit code 1**: Code needs formatting (use `--check` to see what needs fixing)

### isort
- **Exit code 0**: Imports are properly sorted
- **Exit code 1**: Imports need sorting (use `--check-only` to see what needs fixing)

### Pylint
- **Exit code 0**: No errors (may have warnings)
- **Score**: Shows code quality score (aim for > 8.0/10)

### Flake8
- **Exit code 0**: No issues found
- **Exit code 1**: Issues found (shows line numbers and error codes)

### Mypy
- **Exit code 0**: No type errors
- **Exit code 1**: Type errors found

### Pytest
- **Exit code 0**: All tests passed
- **Exit code 1**: Some tests failed
- **Green dots (.)**: Test passed
- **Red F**: Test failed
- **Yellow E**: Test error

---

## Common Issues and Solutions

### Issue: "black: command not found"
**Solution**: Install black: `pip install black` or `pip install -r requirements-dev.txt`

### Issue: "make: command not found" (Windows)
**Solution**: 
- Use `python -m black` instead of `make format`
- Or install make for Windows (e.g., via Chocolatey: `choco install make`)

### Issue: Pylint shows too many warnings
**Solution**: The `.pylintrc` file already disables common warnings. You can add more to the `disable` list in `.pylintrc`.

### Issue: Mypy shows many errors
**Solution**: The `mypy.ini` file already ignores missing imports for third-party libraries. Some errors may be expected and can be ignored.

### Issue: Tests fail
**Solution**: 
- Check if all dependencies are installed: `pip install -r requirements.txt`
- Check if test data files exist
- Run with `-v` flag to see detailed output: `python -m pytest SRC/tests/ -v`

---

## Pre-commit Hooks (Optional)

If you want to automatically run quality checks before each commit:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Test hooks manually
pre-commit run --all-files
```

After installation, quality checks will run automatically when you commit code.

---

## Quick Reference Card

```bash
# Formatting
make format                    # Format code
make check-format              # Check formatting
python -m black SRC/cuepoint   # Format with black
python -m isort SRC/cuepoint   # Sort imports

# Linting
make lint                      # Run all linters
python -m pylint SRC/cuepoint  # Run pylint
python -m flake8 SRC/cuepoint  # Run flake8

# Type Checking
make type-check                # Run mypy
python -m mypy SRC/cuepoint    # Type check

# Testing
python -m pytest SRC/tests/ -v                    # All tests
python -m pytest SRC/tests/unit/ -v               # Unit tests
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py -v  # Step 5.7 tests

# All-in-one
make quality-check             # Format, lint, type-check
```

---

## Tips

1. **Run `make format` regularly** to keep code consistently formatted
2. **Use `make check-format` in CI/CD** to verify formatting without modifying files
3. **Run tests before committing** to catch issues early
4. **Use `-v` flag with pytest** for verbose output to see what's happening
5. **Fix formatting first**, then run linters (formatters can fix some linting issues)
6. **Type checking can be slow** - run it on specific files during development, full codebase before commits

---

## Need Help?

- Check the configuration files:
  - `pyproject.toml` - Black and isort settings
  - `.pylintrc` - Pylint settings
  - `mypy.ini` - Mypy settings
  - `Makefile` - All available targets

- See documentation:
  - `DOCS/development/coding_standards.md` - Coding standards
  - `STEP_5_7_COMPLETE_VERIFICATION.md` - Full verification report

