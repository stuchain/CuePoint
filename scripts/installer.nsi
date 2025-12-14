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
!searchreplace /NOERRORS "." "${VERSION}" " " VERSION_SPACED
!searchparse /NOERRORS "${VERSION}" "" "." "" "." "" VERSION_MAJOR VERSION_MINOR VERSION_PATCH
!if "${VERSION_PATCH}" == ""
    !define VERSION_PATCH "0"
!endif
!define FILE_VERSION "${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_PATCH}.0"

VIProductVersion "${FILE_VERSION}"
VIAddVersionKey "ProductName" "CuePoint"
VIAddVersionKey "FileDescription" "CuePoint Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "StuChain"
VIAddVersionKey "LegalCopyright" "Copyright © 2024 StuChain. All rights reserved."

; Compression
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; Interface settings
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_ABORTWARNING

; Installer pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
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
    
    ; Install files (preserve user data by not overwriting user directories)
    File /r "dist\CuePoint\*"
    
    ; Create Start Menu shortcuts
    CreateDirectory "$SMPROGRAMS\CuePoint"
    CreateShortcut "$SMPROGRAMS\CuePoint\CuePoint.lnk" "$INSTDIR\CuePoint.exe" \
        "" "$INSTDIR\CuePoint.exe" 0 "" "" "CuePoint - Rekordbox Metadata Enrichment Tool"
    CreateShortcut "$SMPROGRAMS\CuePoint\Uninstall CuePoint.lnk" "$INSTDIR\uninstall.exe"
    
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
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "EstimatedSize" $0
    
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
    Delete "$INSTDIR\CuePoint.exe"
    Delete "$INSTDIR\uninstall.exe"
    RMDir /r "$INSTDIR\_internal"
    
    ; Remove shortcuts
    Delete "$SMPROGRAMS\CuePoint\CuePoint.lnk"
    Delete "$SMPROGRAMS\CuePoint\Uninstall CuePoint.lnk"
    RMDir "$SMPROGRAMS\CuePoint"
    
    ; Remove desktop shortcut if it exists
    Delete "$DESKTOP\CuePoint.lnk"
    
    ; Remove registry entries
    DeleteRegKey HKCU "Software\CuePoint"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
    
    ; Ask about user data
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Do you want to delete user data and settings?$\n$\nThis includes:$\n- Configuration files$\n- Cache files$\n- Log files$\n$\nYour exported files will not be deleted." \
        IDNO skip_data
    
    ; Remove user data directories
    RMDir /r "$APPDATA\CuePoint"
    RMDir /r "$LOCALAPPDATA\CuePoint\Cache"
    RMDir /r "$LOCALAPPDATA\CuePoint\Logs"
    
    skip_data:
    
    ; Try to remove installation directory (if empty)
    RMDir "$INSTDIR"
    
    ; Show completion message
    MessageBox MB_OK|MB_ICONINFORMATION \
        "CuePoint has been successfully uninstalled." \
        /SD IDOK
SectionEnd
