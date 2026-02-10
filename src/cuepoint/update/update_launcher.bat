@echo off
REM Update Launcher Batch Script for Windows
REM This script waits for CuePoint to close, then launches the installer,
REM waits for installation to complete, and optionally reopens the app.

setlocal

set INSTALLER_PATH=%~1
set APP_PATH=%~2

if "%INSTALLER_PATH%"=="" (
    echo Error: Installer path not provided
    exit /b 1
)

echo ========================================
echo CuePoint Update Installer
echo ========================================
echo.
echo Waiting for CuePoint to close...
echo.

REM Wait for CuePoint.exe to close (check every second, max 30 seconds)
set /a COUNT=0
:WAIT_LOOP
tasklist /FI "IMAGENAME eq CuePoint.exe" 2>NUL | find /I /N "CuePoint.exe">NUL
if "%ERRORLEVEL%"=="0" (
    set /a COUNT+=1
    if %COUNT% GEQ 30 (
        echo Warning: CuePoint is still running after 30 seconds.
        echo The installer may prompt you to close it.
        goto INSTALL
    )
    timeout /t 1 /nobreak >NUL
    goto WAIT_LOOP
)

:INSTALL
echo CuePoint has closed. Starting installer...
echo.
echo ========================================
echo Installing Update...
echo ========================================
echo.
echo The installer window will now appear.
echo Please follow the installation prompts.
echo.

REM Launch installer (visible, no /S flag, with /UPGRADE for upgrade mode)
start /wait "" "%INSTALLER_PATH%" /UPGRADE

set INSTALLER_EXIT=%ERRORLEVEL%

echo.
echo ========================================
if %INSTALLER_EXIT% EQU 0 (
    echo Installation completed successfully!
) else (
    echo Installation completed with exit code: %INSTALLER_EXIT%
    echo The installation may not have completed successfully.
)
echo ========================================
echo.

REM Ask if user wants to reopen
set /p REOPEN="Do you want to reopen CuePoint now? (Y/N): "
if /i "%REOPEN%"=="Y" (
    if not "%APP_PATH%"=="" (
        if exist "%APP_PATH%" (
            echo.
            echo Launching CuePoint...
            start "" "%APP_PATH%"
            echo CuePoint launched!
        ) else (
            echo.
            echo Error: CuePoint not found at: %APP_PATH%
            echo Please launch it manually.
        )
    ) else (
        REM Try to find CuePoint in default location
        set DEFAULT_PATH=%LOCALAPPDATA%\CuePoint\CuePoint.exe
        if exist "%DEFAULT_PATH%" (
            echo.
            echo Launching CuePoint from default location...
            start "" "%DEFAULT_PATH%"
            echo CuePoint launched!
        ) else (
            echo.
            echo Could not find CuePoint. Please launch it manually.
        )
    )
) else (
    echo.
    echo CuePoint will not be reopened. You can launch it manually when ready.
)

echo.
echo Update launcher will close in 5 seconds...
timeout /t 5 /nobreak >NUL

endlocal
