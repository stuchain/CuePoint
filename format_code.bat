@echo off
REM Format code with Black and isort (Windows batch script)

echo Formatting code with Black...
python -m black SRC/cuepoint

echo.
echo Sorting imports with isort...
python -m isort SRC/cuepoint

echo.
echo Done! Code formatted successfully.

