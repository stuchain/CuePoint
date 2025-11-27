# Running Quality Checks on Windows

Since Windows doesn't have `make` by default, use these alternatives:

## Quick Method: Use Batch Scripts

I've created batch scripts that do the same thing as the Makefile:

### Format Code
```cmd
format_code.bat
```
or double-click `format_code.bat` in Windows Explorer

### Check Formatting
```cmd
check_format.bat
```

### Run Linters
```cmd
run_linters.bat
```

### Type Check
```cmd
type_check.bat
```

### Run All Quality Checks
```cmd
quality_check.bat
```

---

## Direct Python Commands (Alternative)

You can also run the commands directly:

### Format Code
```cmd
python -m black SRC/cuepoint
python -m isort SRC/cuepoint
```

### Check Formatting
```cmd
python -m black --check SRC/cuepoint
python -m isort --check-only SRC/cuepoint
```

### Run Linters
```cmd
python -m pylint SRC/cuepoint
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
```

### Type Check
```cmd
python -m mypy SRC/cuepoint
```

### Run Tests
```cmd
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py -v
python -m pytest SRC/tests/ -v
```

---

## Complete Workflow (Windows)

### Before Committing Code

```cmd
REM 1. Format code
format_code.bat

REM 2. Run all quality checks
quality_check.bat

REM 3. Run tests
python -m pytest SRC/tests/ -v
```

Or use direct commands:
```cmd
python -m black SRC/cuepoint
python -m isort SRC/cuepoint
python -m pylint SRC/cuepoint
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
python -m mypy SRC/cuepoint
python -m pytest SRC/tests/ -v
```

---

## Install Make for Windows (Optional)

If you want to use `make` commands, you can install it:

### Option 1: Using Chocolatey
```cmd
choco install make
```

### Option 2: Using Scoop
```cmd
scoop install make
```

### Option 3: Using Git Bash
Git for Windows includes a bash shell that has `make`. Use Git Bash instead of PowerShell/CMD.

### Option 4: Using WSL (Windows Subsystem for Linux)
If you have WSL installed, you can use `make` from the Linux environment.

---

## PowerShell Scripts (Alternative)

If you prefer PowerShell, here are equivalent commands:

### Format Code (PowerShell)
```powershell
python -m black SRC/cuepoint
python -m isort SRC/cuepoint
```

### Check Formatting (PowerShell)
```powershell
python -m black --check SRC/cuepoint
python -m isort --check-only SRC/cuepoint
```

### Run All Checks (PowerShell)
```powershell
python -m black SRC/cuepoint
python -m isort SRC/cuepoint
python -m pylint SRC/cuepoint
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
python -m mypy SRC/cuepoint
```

---

## Quick Reference for Windows

```cmd
REM Formatting
format_code.bat              REM Format code
check_format.bat             REM Check formatting
python -m black SRC/cuepoint REM Format with black
python -m isort SRC/cuepoint REM Sort imports

REM Linting
run_linters.bat              REM Run all linters
python -m pylint SRC/cuepoint REM Run pylint
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203 REM Run flake8

REM Type Checking
type_check.bat               REM Run mypy
python -m mypy SRC/cuepoint   REM Type check

REM Testing
python -m pytest SRC/tests/ -v                    REM All tests
python -m pytest SRC/tests/unit/test_code_quality_step_5_7.py -v  REM Step 5.7 tests

REM All-in-one
quality_check.bat            REM Format, lint, type-check
```

---

## Troubleshooting

### "python: command not found"
Make sure Python is in your PATH, or use:
```cmd
py -m black SRC/cuepoint
```

### "No module named 'black'"
Install dependencies:
```cmd
pip install -r requirements-dev.txt
```

### Batch script doesn't run
Make sure you're in the project root directory (where the .bat files are).

---

## Recommended Workflow

1. **During development**: Format code regularly
   ```cmd
   format_code.bat
   ```

2. **Before committing**: Run all checks
   ```cmd
   quality_check.bat
   python -m pytest SRC/tests/ -v
   ```

3. **In CI/CD**: Use check commands (don't modify files)
   ```cmd
   check_format.bat
   run_linters.bat
   type_check.bat
   ```

