@echo off
setlocal

pushd "%~dp0apps\desktop-electron" || (
    echo CuePoint desktop files were not found.
    pause
    exit /b 1
)

where npm.cmd >nul 2>nul || (
    echo Node.js and npm are required to run CuePoint.
    echo Install Node.js 22 or newer, then try again.
    popd
    pause
    exit /b 1
)

if not exist "node_modules\electron\package.json" (
    echo CuePoint desktop dependencies are not installed.
    echo Run npm install in apps\desktop-electron, then try again.
    popd
    pause
    exit /b 1
)

call npm.cmd run electron:start
set "cuepoint_exit_code=%errorlevel%"
popd

if not "%cuepoint_exit_code%"=="0" (
    echo.
    echo CuePoint exited with code %cuepoint_exit_code%.
    pause
)

exit /b %cuepoint_exit_code%

