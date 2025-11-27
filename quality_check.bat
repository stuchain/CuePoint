@echo off
REM Run all quality checks (Windows batch script)

echo ========================================
echo Running All Quality Checks
echo ========================================
echo.

echo [1/4] Formatting code...
call format_code.bat
if %errorlevel% neq 0 (
    echo Formatting failed!
    exit /b 1
)

echo.
echo [2/4] Running linters...
call run_linters.bat
if %errorlevel% neq 0 (
    echo Linting failed!
    exit /b 1
)

echo.
echo [3/4] Running type checker...
call type_check.bat
if %errorlevel% neq 0 (
    echo Type checking failed!
    exit /b 1
)

echo.
echo [4/4] All quality checks passed!
echo ========================================

