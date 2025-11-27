@echo off
REM Auto-fix flake8 errors using autopep8

echo ========================================
echo Auto-fixing Flake8 Errors
echo ========================================
echo.

echo Installing autopep8 (auto-fixes many flake8 errors)...
pip install -q autopep8

echo.
echo [1/3] Formatting with black first...
python -m black SRC/cuepoint

echo.
echo [2/3] Sorting imports with isort...
python -m isort SRC/cuepoint

echo.
echo [3/3] Auto-fixing flake8 errors with autopep8...
python -m autopep8 --in-place --aggressive --aggressive --max-line-length=100 --ignore=E203 -r SRC/cuepoint

echo.
echo Checking remaining flake8 errors...
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203 --count --statistics

echo.
echo ========================================
echo Auto-fix complete!
echo ========================================
echo.
echo Note: Some errors may need manual fixing.
echo If there are still errors, you can:
echo   1. Fix them manually
echo   2. Commit with --no-verify: git commit --no-verify -m "message"
echo.

