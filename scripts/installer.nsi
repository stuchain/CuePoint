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
; OutFile is relative to the .nsi script location (scripts/), so use ..\dist\ to reach project root
OutFile "..\dist\CuePoint-Setup-v${VERSION}.exe"
InstallDir "$LOCALAPPDATA\CuePoint"
RequestExecutionLevel user  ; Per-user installation (no admin required)

; Version information (will be replaced by build script)
; NOTE: VERSION should be the base version (X.Y.Z) without prerelease suffixes
; The build script extracts the base version before passing to NSIS
!ifndef VERSION
    !define VERSION "1.0.0"
!endif

; Dist directory path (relative to scripts/ directory where .nsi file is located)
; Always use relative path since NSIS File command works best with relative paths
!define DISTDIR "..\dist"

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
            ; App is running - ask user to close it and wait
            MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
                "CuePoint is currently running.$\n$\nPlease close CuePoint and click OK to continue with the installation.$\n$\nClick Cancel to exit the installer." \
                IDOK wait_for_close
            Abort
            
            wait_for_close:
            ; Wait for app to close (check every second, max 60 seconds)
            StrCpy $R2 0
            ${Do}
                Sleep 1000
                IntOp $R2 $R2 + 1
                FindWindow $R1 "" "CuePoint"
                ${If} $R1 == 0
                    ${Break}  ; App closed, continue
                ${EndIf}
                ${If} $R2 >= 60
                    MessageBox MB_OK|MB_ICONSTOP \
                        "CuePoint is still running after 60 seconds.$\n$\nPlease close CuePoint manually and run the installer again." \
                        /SD IDOK
                    Abort
                ${EndIf}
            ${Loop}
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
        ; App is running - wait for it to close
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
            "CuePoint is currently running.$\n$\nPlease close CuePoint and click OK to continue.$\n$\nClick Cancel to exit." \
            IDOK wait_for_close_install
        Abort
        
        wait_for_close_install:
        ; Wait for app to close (check every second, max 60 seconds)
        StrCpy $R2 0
        ${Do}
            Sleep 1000
            IntOp $R2 $R2 + 1
            FindWindow $R0 "" "CuePoint"
            ${If} $R0 == 0
                ${Break}  ; App closed, continue
            ${EndIf}
            ${If} $R2 >= 60
                MessageBox MB_OK|MB_ICONSTOP \
                    "CuePoint is still running after 60 seconds.$\n$\nPlease close CuePoint manually and run the installer again." \
                    /SD IDOK
                Abort
            ${EndIf}
        ${Loop}
    ${EndIf}
    
    ; Set output directory
    SetOutPath "$INSTDIR"
    
    ; CRITICAL: Delete old executable BEFORE installing new one
    ; This prevents file locking issues that can corrupt PyInstaller's internal archive
    ; PyInstaller one-file executables are archives - if overwritten while locked, DLLs won't extract
    ; Delete with /REBOOTOK flag to handle locked files (will delete on reboot if needed)
    Delete /REBOOTOK "$INSTDIR\CuePoint.exe"
    
    ; Small delay to ensure Windows releases file locks
    ; This is critical for PyInstaller executables which have internal archives
    Sleep 500
    
    ; Install executable
    ; PyInstaller creates CuePoint.exe directly in dist/ (onefile mode)
    ; File command is processed at COMPILE TIME, so file must exist when makensis runs
    ; Paths are relative to the .nsi file location (scripts/), so use ..\dist\ to reach project root
    ; Since we verified the file exists before running makensis, we can use it directly
    
    ; Install the executable (onefile mode - single exe file)
    ; Use DISTDIR define which can be absolute path or relative path
    ; SetOutPath already set the output directory, so File will install to $INSTDIR\CuePoint.exe
    ; The Delete command above ensures clean replacement without file locking issues
    File "${DISTDIR}\CuePoint.exe"
    
    ; Create Start Menu shortcuts
    ; CreateDirectory might fail if it already exists, but that's OK
    CreateDirectory "$SMPROGRAMS\CuePoint"
    CreateShortcut "$SMPROGRAMS\CuePoint\CuePoint.lnk" "$INSTDIR\CuePoint.exe" \
        "" "$INSTDIR\CuePoint.exe" 0 "" "" "CuePoint - Rekordbox Metadata Enrichment Tool"
    CreateShortcut "$SMPROGRAMS\CuePoint\Uninstall CuePoint.lnk" "$INSTDIR\uninstall.exe" \
        "" "$INSTDIR\uninstall.exe" 0 "" "" "Uninstall CuePoint"
    
    ; Force Windows to refresh icon cache after installation
    ; This helps ensure the new icon appears in taskbar/dock immediately
    ; SHChangeNotify tells Windows to refresh its icon cache
    System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    
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
