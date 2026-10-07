@echo off
rem Builds and launches the CuePoint desktop app (Electron + Python engine).
rem The engine runs on the repo's .venv Python when present; set CUEPOINT_PYTHON to override.
setlocal
rem VS Code and other Electron hosts export this; it makes electron.exe run as plain Node.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0apps\desktop-electron" || exit /b 1

if not exist "node_modules" (
    echo Installing desktop dependencies...
    call npm install || goto :fail
)
if not exist "renderer\node_modules" (
    echo Installing renderer dependencies...
    call npm install --prefix renderer || goto :fail
)

call npm run electron:start || goto :fail
exit /b 0

:fail
echo.
echo CuePoint failed to start. See the output above.
pause
exit /b 1
