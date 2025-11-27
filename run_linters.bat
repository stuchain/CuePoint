@echo off
REM Run all linters (Windows batch script)

echo Running Pylint...
python -m pylint SRC/cuepoint

echo.
echo Running Flake8...
python -m flake8 SRC/cuepoint --max-line-length=100 --extend-ignore=E203

echo.
echo Linting complete!

