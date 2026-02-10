@echo off
REM Organize root directory files into proper folders
REM Moves documentation to docs/guides/ and scripts to scripts/

echo ========================================
echo Root Directory Files Organization
echo ========================================
echo.
echo This will organize files into:
echo   - docs/guides/     (documentation files)
echo   - scripts/         (utility scripts)
echo.
echo Essential files (config, requirements, launch scripts) stay in root.
echo.
pause

REM Create directories
echo Creating directories...
if not exist "docs\GUIDES" mkdir "docs\GUIDES"
if not exist "scripts" mkdir "scripts"

REM Move documentation files to docs/guides/
echo Moving documentation files...
if exist "CLEANUP_PLAN.md" move "CLEANUP_PLAN.md" "docs\GUIDES\" >nul
if exist "fix-pyside6-macos.md" move "fix-pyside6-macos.md" "docs\GUIDES\" >nul
if exist "install-macos.md" move "install-macos.md" "docs\GUIDES\" >nul
if exist "how-to-see-shortcuts.md" move "how-to-see-shortcuts.md" "docs\GUIDES\" >nul
if exist "ORGANIZE_FILES.md" move "ORGANIZE_FILES.md" "docs\GUIDES\" >nul
if exist "ROOT_FILES_ORGANIZATION.md" move "ROOT_FILES_ORGANIZATION.md" "docs\GUIDES\" >nul

REM Move utility scripts to scripts/
echo Moving utility scripts...
if exist "cleanup_files.bat" move "cleanup_files.bat" "scripts\" >nul
if exist "cleanup_files.sh" move "cleanup_files.sh" "scripts\" >nul
if exist "organize_old_files.bat" move "organize_old_files.bat" "scripts\" >nul
if exist "organize_old_files.sh" move "organize_old_files.sh" "scripts\" >nul

echo.
echo ========================================
echo Organization complete!
echo ========================================
echo.
echo Files moved:
echo   docs\GUIDES\     - Documentation files
echo   scripts\         - Utility scripts
echo.
echo Essential files remain in root:
echo   - Configuration files (.coveragerc, .gitignore, etc.)
echo   - Requirements files (requirements.txt, etc.)
echo   - Launch scripts (run_gui.bat, run_gui.sh, etc.)
echo   - README.md
echo.
pause

