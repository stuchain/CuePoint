@echo off
REM Organize DOCS folder structure
REM This reorganizes documentation into a cleaner structure

echo ========================================
echo DOCS Folder Reorganization
echo ========================================
echo.
echo This will reorganize the DOCS folder into:
echo   - DEVELOPMENT/guidelines/     (coding standards, testing, error handling)
echo   - DEVELOPMENT/architecture/   (architecture docs)
echo   - PHASES/completed/           (completed phases 0-7)
echo   - PHASES/in_progress/         (current phase 8)
echo   - PHASES/future/              (future features)
echo   - DESIGNS/implemented/        (implemented designs)
echo   - DESIGNS/future/             (future designs)
echo   - DESIGNS/ARCHIVE/            (old designs)
echo.
pause

cd DOCS

REM Create new directory structure
echo Creating directory structure...
if not exist "DEVELOPMENT\guidelines" mkdir "DEVELOPMENT\guidelines"
if not exist "DEVELOPMENT\architecture" mkdir "DEVELOPMENT\architecture"
if not exist "PHASES\completed" mkdir "PHASES\completed"
if not exist "PHASES\in_progress" mkdir "PHASES\in_progress"
if not exist "PHASES\future" mkdir "PHASES\future"
if not exist "DESIGNS\implemented" mkdir "DESIGNS\implemented"
if not exist "DESIGNS\future" mkdir "DESIGNS\future"
if not exist "DESIGNS\ARCHIVE" mkdir "DESIGNS\ARCHIVE"
if not exist "ARCHIVE" mkdir "ARCHIVE"

REM Move development guidelines
echo Moving development guidelines...
if exist "ERROR_HANDLING_GUIDELINES.md" move "ERROR_HANDLING_GUIDELINES.md" "DEVELOPMENT\guidelines\" >nul
if exist "TESTING_GUIDELINES.md" move "TESTING_GUIDELINES.md" "DEVELOPMENT\guidelines\" >nul
if exist "DEVELOPMENT\coding-standards.md" move "DEVELOPMENT\coding-standards.md" "DEVELOPMENT\guidelines\" >nul

REM Move architecture docs
echo Moving architecture documentation...
if exist "SEARCH_ARCHITECTURE.md" move "SEARCH_ARCHITECTURE.md" "DEVELOPMENT\architecture\" >nul
if exist "PERFORMANCE_CHARACTERISTICS.md" move "PERFORMANCE_CHARACTERISTICS.md" "DEVELOPMENT\architecture\" >nul

REM Move completed phases (0-7)
echo Moving completed phases...
if exist "PHASES\00_Phase_0_Backend_Foundation.md" move "PHASES\00_Phase_0_Backend_Foundation.md" "PHASES\completed\" >nul
if exist "PHASES\01_Phase_1_GUI_Foundation.md" move "PHASES\01_Phase_1_GUI_Foundation.md" "PHASES\completed\" >nul
if exist "PHASES\02_Phase_2_GUI_User_Experience.md" move "PHASES\02_Phase_2_GUI_User_Experience.md" "PHASES\completed\" >nul
if exist "PHASES\03_Phase_3_Reliability_Performance.md" move "PHASES\03_Phase_3_Reliability_Performance.md" "PHASES\completed\" >nul
if exist "PHASES\04_Phase_4_Advanced_Features.md" move "PHASES\04_Phase_4_Advanced_Features.md" "PHASES\completed\" >nul
if exist "PHASES\04_Phase_4_Advanced_Features" move "PHASES\04_Phase_4_Advanced_Features" "PHASES\completed\" >nul
if exist "PHASES\05_Phase_5_Code_Restructuring.md" move "PHASES\05_Phase_5_Code_Restructuring.md" "PHASES\completed\" >nul
if exist "PHASES\05_Phase_5_Code_Restructuring" move "PHASES\05_Phase_5_Code_Restructuring" "PHASES\completed\" >nul
if exist "PHASES\06_Phase_6_UI_Restructuring.md" move "PHASES\06_Phase_6_UI_Restructuring.md" "PHASES\completed\" >nul
if exist "PHASES\06_Phase_6_UI_Restructuring" move "PHASES\06_Phase_6_UI_Restructuring" "PHASES\completed\" >nul
if exist "PHASES\07_Phase_7_Packaging_Polish.md" move "PHASES\07_Phase_7_Packaging_Polish.md" "PHASES\completed\" >nul

REM Move in-progress phase (8)
echo Moving in-progress phase...
if exist "PHASES\08_Phase_8_Async_IO.md" move "PHASES\08_Phase_8_Async_IO.md" "PHASES\in_progress\" >nul
if exist "PHASES\08_Phase_8_Async_IO" move "PHASES\08_Phase_8_Async_IO" "PHASES\in_progress\" >nul
if exist "PHASES\08_Phase_8_UI_Restructuring.md" move "PHASES\08_Phase_8_UI_Restructuring.md" "PHASES\in_progress\" >nul

REM Move future features
echo Moving future features...
if exist "PHASES\!Future_Features" move "PHASES\!Future_Features" "PHASES\future\Future_Features" >nul

REM Move implemented designs (key ones we know are implemented)
echo Moving implemented designs...
if exist "DESIGNS\00_Desktop_GUI_Application_Design.md" move "DESIGNS\00_Desktop_GUI_Application_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\01_Progress_Bar_Design.md" move "DESIGNS\01_Progress_Bar_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\03_YAML_Configuration_Design.md" move "DESIGNS\03_YAML_Configuration_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\04_Data_Model_Migration_Design.md" move "DESIGNS\04_Data_Model_Migration_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\05_CLI_Migration_Design.md" move "DESIGNS\05_CLI_Migration_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\07_Test_Suite_Foundation_Design.md" move "DESIGNS\07_Test_Suite_Foundation_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\08_Batch_Playlist_Processing_Design.md" move "DESIGNS\08_Batch_Playlist_Processing_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\17_Executable_Packaging_Design.md" move "DESIGNS\17_Executable_Packaging_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\18_GUI_Enhancements_Design.md" move "DESIGNS\18_GUI_Enhancements_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\19_Results_Preview_Table_View_Design.md" move "DESIGNS\19_Results_Preview_Table_View_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\20_Export_Format_Options_Design.md" move "DESIGNS\20_Export_Format_Options_Design.md" "DESIGNS\implemented\" >nul
if exist "DESIGNS\21_Backend_Refactoring_GUI_Readiness_Design.md" move "DESIGNS\21_Backend_Refactoring_GUI_Readiness_Design.md" "DESIGNS\implemented\" >nul

REM Move future designs
echo Moving future designs...
if exist "DESIGNS\11_Web_Interface_Design.md" move "DESIGNS\11_Web_Interface_Design.md" "DESIGNS\future\" >nul
if exist "DESIGNS\13_PyPI_Packaging_Design.md" move "DESIGNS\13_PyPI_Packaging_Design.md" "DESIGNS\future\" >nul
if exist "DESIGNS\14_Docker_Containerization_Design.md" move "DESIGNS\14_Docker_Containerization_Design.md" "DESIGNS\future\" >nul
if exist "DESIGNS\15_Additional_Metadata_Sources_Design.md" move "DESIGNS\15_Additional_Metadata_Sources_Design.md" "DESIGNS\future\" >nul
if exist "DESIGNS\16_Feature_Enhancement_Ideas_Design.md" move "DESIGNS\16_Feature_Enhancement_Ideas_Design.md" "DESIGNS\future\" >nul

REM Archive old designs
echo Archiving old designs...
if exist "DESIGNS\DESIGN_REVIEW.md" move "DESIGNS\DESIGN_REVIEW.md" "DESIGNS\ARCHIVE\" >nul

REM Move remaining designs to implemented (they're likely implemented)
echo Moving remaining designs to implemented...
for %%f in (DESIGNS\*.md) do if exist "%%f" move "%%f" "DESIGNS\implemented\" >nul

REM Clean up empty directories
echo Cleaning up empty directories...
if exist "development" rmdir "development" 2>nul

cd ..

echo.
echo ========================================
echo Reorganization complete!
echo ========================================
echo.
echo New structure:
echo   DEVELOPMENT/guidelines/     - Coding standards, testing, error handling
echo   DEVELOPMENT/architecture/   - Architecture documentation
echo   PHASES/completed/           - Completed phases 0-7
echo   PHASES/in_progress/         - Current phase 8
echo   PHASES/future/              - Future features
echo   DESIGNS/implemented/        - Implemented designs
echo   DESIGNS/future/             - Future designs
echo   DESIGNS/ARCHIVE/            - Old designs
echo.
pause

