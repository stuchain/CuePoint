# Auto-Fix Flake8 Errors

## Quick Solution: Use autopep8

Flake8 doesn't auto-fix, but `autopep8` can automatically fix many flake8 errors.

### Install autopep8

```powershell
pip install autopep8
```

### Auto-fix All Errors

```powershell
# Auto-fix flake8 errors
python -m autopep8 --in-place --aggressive --aggressive --max-line-length=100 --ignore=E203 -r SRC/cuepoint
```

### Complete Workflow

```powershell
# 1. Format with black
python -m black SRC/cuepoint

# 2. Sort imports with isort
python -m isort SRC/cuepoint

# 3. Auto-fix flake8 errors
python -m autopep8 --in-place --aggressive --aggressive --max-line-length=100 --ignore=E203 -r SRC/cuepoint

# 4. Check remaining errors
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203

# 5. Commit
git add .
git commit -m "your message"
```

## Alternative: Use Ruff (Modern & Fast)

`ruff` is a modern, fast linter that can auto-fix many issues:

```powershell
# Install ruff
pip install ruff

# Auto-fix errors
ruff check --fix SRC/cuepoint

# Format code (ruff can also format)
ruff format SRC/cuepoint
```

## What autopep8 Fixes

- Line length issues
- Whitespace problems
- Import organization (some)
- Unused imports (with --aggressive)
- Simple syntax issues

## What autopep8 Can't Fix

- Complex logic errors
- Type issues
- Some import order issues (use isort for that)
- Design/architecture issues

## Quick Script

I've created `auto_fix_flake8.bat` - just run it:

```powershell
auto_fix_flake8.bat
```

This will:
1. Install autopep8 if needed
2. Format with black
3. Sort imports with isort
4. Auto-fix flake8 errors
5. Show remaining errors (if any)

## If Errors Remain

After auto-fixing, if there are still errors:

1. **Fix manually** - flake8 will show line numbers
2. **Skip flake8** - `SKIP=flake8 git commit -m "message"`
3. **Skip all hooks** - `git commit --no-verify -m "message"`

## Recommended Approach

1. Run `auto_fix_flake8.bat` first
2. Fix any remaining errors manually (usually just a few)
3. Commit normally

Most flake8 errors can be auto-fixed with autopep8!

