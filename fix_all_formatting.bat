@echo off
REM Fix all formatting and linting issues before commit

echo ========================================
echo Fixing All Code Quality Issues
echo ========================================
echo.

REM Check if tools are installed
echo Checking if tools are installed...
python -m black --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing black and isort...
    pip install -q black isort
)

echo.
echo [1/3] Formatting code with black...
python -m black SRC/cuepoint
if %errorlevel% neq 0 (
    echo ERROR: Black formatting failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Sorting imports with isort...
python -m isort SRC/cuepoint
if %errorlevel% neq 0 (
    echo ERROR: isort failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Checking for linting errors with flake8...
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203 --count --statistics
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Flake8 found some issues.
    echo These need to be fixed manually - flake8 doesn't auto-fix.
    echo.
    echo You can either:
    echo   1. Fix the errors shown above
    echo   2. Commit with --no-verify to skip hooks: git commit --no-verify -m "message"
    echo.
    pause
) else (
    echo Flake8 check passed!
)

echo.
echo ========================================
echo Formatting complete!
echo ========================================
echo.
echo Now you can commit:
echo   git add .
echo   git commit -m "your message"
echo.

