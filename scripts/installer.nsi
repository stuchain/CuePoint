; NSIS Installer Script for CuePoint
; Creates Windows installer executable
; Usage: makensis /DVERSION=1.0.0 installer.nsi
; Requires: NSIS 3.0+

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

; Application information
Name "CuePoint"
OutFile "dist\CuePoint-Setup-v${VERSION}.exe"
InstallDir "$LOCALAPPDATA\CuePoint"
RequestExecutionLevel user  ; Per-user installation (no admin required)

; Version information (will be replaced by build script)
!ifndef VERSION
    !define VERSION "1.0.0"
!endif

; Convert version to four-part format for VIProductVersion
; VIProductVersion requires format: "X.X.X.X" (four numbers separated by dots)
; Simple approach: append ".0" to three-part version (e.g., "1.0.0" -> "1.0.0.0")
!define FILE_VERSION "${VERSION}.0"

VIProductVersion "${FILE_VERSION}"
VIAddVersionKey "ProductName" "CuePoint"
VIAddVersionKey "FileDescription" "CuePoint Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "StuChain"
VIAddVersionKey "LegalCopyright" "Copyright (C) 2024 StuChain. All rights reserved."

; Compression
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; Interface settings
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_ABORTWARNING

; Installer pages
!insertmacro MUI_PAGE_WELCOME
; License page removed - LICENSE.txt not found
; !insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\CuePoint.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch CuePoint"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

; Variables
Var InstalledVersion
Var UpgradeMode

; Function to check if already installed and detect upgrade
Function .onInit
    ; Check for existing installation
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" "InstallLocation"
    ${If} $R0 != ""
        ; Existing installation found
        ReadRegStr $InstalledVersion HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" "DisplayVersion"
        StrCpy $UpgradeMode "1"
        
        ; Check if app is running
        FindWindow $R1 "" "CuePoint"
        ${If} $R1 != 0
            MessageBox MB_OK|MB_ICONEXCLAMATION \
                "CuePoint is currently running.$\n$\nPlease close CuePoint before upgrading.$\n$\nThe installer will now exit." \
                /SD IDOK
            Abort
        ${EndIf}
        
        ; Prompt user about upgrade
        ${If} $InstalledVersion == "${VERSION}"
            MessageBox MB_YESNO|MB_ICONQUESTION \
                "CuePoint version ${VERSION} is already installed at:$\n$R0$\n$\nDo you want to reinstall?" \
                IDYES continue_install
            Abort
        ${Else}
            MessageBox MB_YESNO|MB_ICONQUESTION \
                "CuePoint version $InstalledVersion is already installed at:$\n$R0$\n$\nDo you want to upgrade to version ${VERSION}?" \
                IDYES continue_install
            Abort
        ${EndIf}
        
        continue_install:
        ; Set install directory to existing location
        StrCpy $INSTDIR $R0
    ${Else}
        ; New installation
        StrCpy $UpgradeMode "0"
    ${EndIf}
FunctionEnd

; Installation section
Section "Install" SecMain
    ; Check if app is running (double-check)
    FindWindow $R0 "" "CuePoint"
    ${If} $R0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "CuePoint is currently running.$\n$\nPlease close CuePoint before installing.$\n$\nThe installer will now exit." \
            /SD IDOK
        Abort
    ${EndIf}
    
    ; Set output directory
    SetOutPath "$INSTDIR"
    
    ; Install executable
    ; PyInstaller creates CuePoint.exe directly in dist/ (onefile mode)
    ; or in dist/CuePoint/ (onedir mode) - handle both cases
    ; Note: File command is processed at compile time, so files must exist when makensis runs
    
    ; Check for onefile mode first (CuePoint.exe in dist/)
    IfFileExists "dist\CuePoint.exe" 0 CheckOneDir
    File "dist\CuePoint.exe"
    Goto FilesInstalled
    
    CheckOneDir:
        ; Check for onedir mode (CuePoint.exe in dist/CuePoint/)
        IfFileExists "dist\CuePoint\CuePoint.exe" 0 NoFiles
        File /r "dist\CuePoint\*"
        Goto FilesInstalled
    
    NoFiles:
        ; This error should not occur if build completed successfully
        ; The File command will fail at compile time if files don't exist
        MessageBox MB_OK|MB_ICONSTOP "Error: CuePoint.exe not found during installer compilation.$\n$\nExpected:$\n  - dist\CuePoint.exe (onefile mode)$\n  - dist\CuePoint\CuePoint.exe (onedir mode)$\n$\nPlease ensure PyInstaller build completed successfully before building installer." /SD IDOK
        Abort
    
    FilesInstalled:
    
    ; Create Start Menu shortcuts
    ; CreateDirectory might fail if it already exists, but that's OK
    CreateDirectory "$SMPROGRAMS\CuePoint"
    CreateShortcut "$SMPROGRAMS\CuePoint\CuePoint.lnk" "$INSTDIR\CuePoint.exe" \
        "" "$INSTDIR\CuePoint.exe" 0 "" "" "CuePoint - Rekordbox Metadata Enrichment Tool"
    CreateShortcut "$SMPROGRAMS\CuePoint\Uninstall CuePoint.lnk" "$INSTDIR\uninstall.exe" \
        "" "$INSTDIR\uninstall.exe" 0 "" "" "Uninstall CuePoint"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    ; Registry entries for application
    WriteRegStr HKCU "Software\CuePoint" "InstallPath" "$INSTDIR"
    WriteRegStr HKCU "Software\CuePoint" "Version" "${VERSION}"
    
    ; Uninstaller registry entry (Add/Remove Programs)
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "DisplayName" "CuePoint"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "Publisher" "StuChain"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "DisplayIcon" "$INSTDIR\CuePoint.exe"
    
    ; Calculate and store installation size
    ; GetSize might fail if directory is empty, so use error handling
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    ${If} $0 > 0
        IntFmt $0 "0x%08X" $0
        WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
            "EstimatedSize" $0
    ${Else}
        ; Default size if calculation fails
        WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
            "EstimatedSize" 0x00100000
    ${EndIf}
    
    ; Registry flags
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "NoRepair" 1
    
    ; Show upgrade message if upgrading
    ${If} $UpgradeMode == "1"
        MessageBox MB_OK|MB_ICONINFORMATION \
            "CuePoint has been successfully upgraded from version $InstalledVersion to ${VERSION}.$\n$\nYour settings and data have been preserved." \
            /SD IDOK
    ${EndIf}
SectionEnd

; Uninstaller section
Section "Uninstall"
    ; Check if app is running
    FindWindow $R0 "" "CuePoint"
    ${If} $R0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "CuePoint is currently running.$\n$\nPlease close CuePoint before uninstalling.$\n$\nThe uninstaller will now exit." \
            /SD IDOK
        Abort
    ${EndIf}
    
    ; Remove files from installation directory
    ; Handle both onefile mode (just exe) and onedir mode (exe + _internal directory)
    Delete "$INSTDIR\CuePoint.exe"
    Delete "$INSTDIR\uninstall.exe"
    
    ; Remove _internal directory if it exists (onedir mode)
    IfFileExists "$INSTDIR\_internal" 0 SkipInternal
    RMDir /r "$INSTDIR\_internal"
    SkipInternal:
    
    ; Remove any other files that might exist
    Delete "$INSTDIR\*.*"
    
    ; Remove shortcuts (use /REBOOTOK to handle locked files)
    Delete /REBOOTOK "$SMPROGRAMS\CuePoint\CuePoint.lnk"
    Delete /REBOOTOK "$SMPROGRAMS\CuePoint\Uninstall CuePoint.lnk"
    RMDir "$SMPROGRAMS\CuePoint"
    
    ; Remove desktop shortcut if it exists
    Delete /REBOOTOK "$DESKTOP\CuePoint.lnk"
    
    ; Remove registry entries
    DeleteRegKey HKCU "Software\CuePoint"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
    
    ; Ask about user data
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Do you want to delete user data and settings?$\n$\nThis includes:$\n- Configuration files$\n- Cache files$\n- Log files$\n$\nYour exported files will not be deleted." \
        IDNO skip_data
    
    ; Remove user data directories (only if they exist)
    IfFileExists "$APPDATA\CuePoint" 0 SkipAppData
    RMDir /r "$APPDATA\CuePoint"
    SkipAppData:
    
    IfFileExists "$LOCALAPPDATA\CuePoint\Cache" 0 SkipCache
    RMDir /r "$LOCALAPPDATA\CuePoint\Cache"
    SkipCache:
    
    IfFileExists "$LOCALAPPDATA\CuePoint\Logs" 0 SkipLogs
    RMDir /r "$LOCALAPPDATA\CuePoint\Logs"
    SkipLogs:
    
    skip_data:
    
    ; Try to remove installation directory (if empty)
    ; Use /REBOOTOK in case files are locked
    RMDir /REBOOTOK "$INSTDIR"
    
    ; Show completion message
    MessageBox MB_OK|MB_ICONINFORMATION \
        "CuePoint has been successfully uninstalled." \
        /SD IDOK
SectionEnd
