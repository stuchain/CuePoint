@echo off
REM Run type checker (Windows batch script)

echo Running Mypy type checker...
python -m mypy SRC/cuepoint

echo.
echo Type checking complete!

