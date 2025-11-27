# Troubleshooting Git Commit Issues

## Common Issues and Solutions

### 1. Pre-commit Hooks Failing

If pre-commit hooks are installed (from Step 5.7), they might be blocking your commit.

#### Check what's failing:
```bash
# Try to commit and see the error
git commit -m "test"

# Or run pre-commit manually
pre-commit run --all-files
```

#### Common pre-commit failures:

**Black formatting issues:**
```bash
# Fix formatting
python -m black SRC/cuepoint

# Then try commit again
git add .
git commit -m "your message"
```

**isort import sorting issues:**
```bash
# Fix imports
python -m isort SRC/cuepoint

# Then try commit again
git add .
git commit -m "your message"
```

**Flake8 linting errors:**
```bash
# Check what's wrong
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203

# Fix the errors, then commit
```

### 2. Skip Pre-commit Hooks (Temporary)

If you need to commit urgently and fix formatting later:

```bash
# Skip all hooks
git commit --no-verify -m "your message"

# Or skip specific hook
SKIP=black git commit -m "your message"
SKIP=isort git commit -m "your message"
SKIP=flake8 git commit -m "your message"
```

**⚠️ Warning**: Only use `--no-verify` if you're sure the code is correct. It's better to fix the issues.

### 3. No Files Staged

Make sure you've staged your files:

```bash
# Check what's changed
git status

# Stage all changes
git add .

# Or stage specific files
git add path/to/file.py

# Then commit
git commit -m "your message"
```

### 4. Fix All Formatting Issues at Once

```bash
# Format everything
python -m black SRC/cuepoint
python -m isort SRC/cuepoint

# Stage the formatted files
git add SRC/cuepoint

# Commit
git commit -m "Format code with black and isort"
```

### 5. Disable Pre-commit Hooks (Not Recommended)

If you want to disable pre-commit hooks entirely:

```bash
# Uninstall pre-commit hooks
pre-commit uninstall

# To reinstall later
pre-commit install
```

### 6. Check Git Configuration

```bash
# Check if hooks are enabled
git config core.hooksPath

# Check git user config
git config user.name
git config user.email
```

### 7. Quick Fix Script

Create a `fix_and_commit.bat` file:

```batch
@echo off
echo Formatting code...
python -m black SRC/cuepoint
python -m isort SRC/cuepoint

echo.
echo Staging files...
git add .

echo.
echo Committing...
git commit -m "%*"

echo.
echo Done!
```

Usage:
```bash
fix_and_commit.bat "Your commit message"
```

## Step-by-Step Debugging

1. **Check git status:**
   ```bash
   git status
   ```

2. **See what would be committed:**
   ```bash
   git diff --cached
   ```

3. **Try committing with verbose output:**
   ```bash
   git commit -v -m "test"
   ```

4. **Run pre-commit manually to see errors:**
   ```bash
   pre-commit run --all-files
   ```

5. **Check for specific errors:**
   ```bash
   # Formatting
   python -m black --check SRC/cuepoint
   
   # Imports
   python -m isort --check-only SRC/cuepoint
   
   # Linting
   python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203
   ```

## Most Likely Solution

If pre-commit hooks are blocking, run:

```bash
# Format code
python -m black SRC/cuepoint
python -m isort SRC/cuepoint

# Stage and commit
git add .
git commit -m "your message"
```

This should fix most formatting issues that block commits.

