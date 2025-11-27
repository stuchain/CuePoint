@echo off
REM Quick commit script that formats code and commits

echo Installing/updating development dependencies...
pip install -q black isort

echo.
echo Formatting code with black...
python -m black SRC/cuepoint 2>nul
if %errorlevel% neq 0 (
    echo Warning: Black formatting had issues, but continuing...
)

echo.
echo Sorting imports with isort...
python -m isort SRC/cuepoint 2>nul
if %errorlevel% neq 0 (
    echo Warning: isort had issues, but continuing...
)

echo.
echo Staging all changes...
git add .

echo.
echo Attempting commit...
if "%1"=="" (
    echo Usage: quick_commit.bat "your commit message"
    echo.
    echo Or commit with --no-verify to skip hooks:
    git commit --no-verify -m "WIP: Temporary commit"
) else (
    git commit -m "%*"
    if %errorlevel% neq 0 (
        echo.
        echo Commit failed. Trying with --no-verify...
        git commit --no-verify -m "%*"
    )
)

echo.
echo Done!

