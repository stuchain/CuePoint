@echo off
echo Checking Playwright...
python -c "import playwright" 2>nul
if errorlevel 1 (
    echo Playwright not found. Installing...
    pip install playwright
)
echo Ensuring Chromium for Playwright...
python -m playwright install chromium
cd src
python gui_app.py
pause

