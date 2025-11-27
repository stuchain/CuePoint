@echo off
REM Check code formatting without modifying files (Windows batch script)

echo Checking code formatting with Black...
python -m black --check SRC/cuepoint
if %errorlevel% neq 0 (
    echo Black found formatting issues!
    exit /b 1
)

echo.
echo Checking import sorting with isort...
python -m isort --check-only SRC/cuepoint
if %errorlevel% neq 0 (
    echo isort found import issues!
    exit /b 1
)

echo.
echo All formatting checks passed!

