; NSIS Installer Script for CuePoint
; Creates Windows installer executable
; Usage: makensis installer.nsi
; Requires: NSIS 3.0+

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Application information
Name "CuePoint"
OutFile "dist\CuePoint-v${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\CuePoint"
RequestExecutionLevel user

; Version information (will be replaced by build script)
!ifndef VERSION
    !define VERSION "1.0.0"
!endif

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "CuePoint"
VIAddVersionKey "FileDescription" "CuePoint Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "StuChain"
VIAddVersionKey "LegalCopyright" "Copyright © 2024 StuChain"

; Interface settings
!define MUI_ICON "resources\icon.ico"
!define MUI_UNICON "resources\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "resources\header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "resources\wizard.bmp"
!define MUI_ABORTWARNING

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\CuePoint.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch CuePoint"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "View README"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installation section
Section "Install" SecMain
    SetOutPath "$INSTDIR"
    
    ; Install files
    File /r "dist\CuePoint\*"
    
    ; Create Start Menu shortcuts
    CreateDirectory "$SMPROGRAMS\CuePoint"
    CreateShortcut "$SMPROGRAMS\CuePoint\CuePoint.lnk" "$INSTDIR\CuePoint.exe"
    CreateShortcut "$SMPROGRAMS\CuePoint\Uninstall.lnk" "$INSTDIR\uninstall.exe"
    
    ; Create Desktop shortcut (optional, commented out by default)
    ; CreateShortcut "$DESKTOP\CuePoint.lnk" "$INSTDIR\CuePoint.exe"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    ; Registry entries
    WriteRegStr HKCU "Software\CuePoint" "InstallPath" "$INSTDIR"
    WriteRegStr HKCU "Software\CuePoint" "Version" "${VERSION}"
    
    ; Uninstaller registry
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "DisplayName" "CuePoint"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "Publisher" "StuChain"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "NoRepair" 1
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint" \
        "InstallLocation" "$INSTDIR"
SectionEnd

; Uninstaller section
Section "Uninstall"
    ; Remove files
    RMDir /r "$INSTDIR"
    
    ; Remove shortcuts
    RMDir /r "$SMPROGRAMS\CuePoint"
    ; Delete "$DESKTOP\CuePoint.lnk"
    
    ; Remove registry entries
    DeleteRegKey HKCU "Software\CuePoint"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CuePoint"
    
    ; Ask about user data
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Do you want to delete user data and settings?$\n$\n" \
        "This will remove all configuration, cache, and logs." \
        IDNO skip_data
    
    ; Remove user data
    RMDir /r "$APPDATA\CuePoint"
    RMDir /r "$LOCALAPPDATA\CuePoint"
    
    skip_data:
    
    ; Show completion message
    MessageBox MB_OK "CuePoint has been uninstalled successfully."
SectionEnd

; Function to check if already installed
Function .onInit
    ; Check if already installed
    ReadRegStr $R0 HKCU "Software\CuePoint" "InstallPath"
    ${If} $R0 != ""
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
            "CuePoint is already installed at:$\n$R0$\n$\n" \
            "Click OK to reinstall or Cancel to exit." \
            IDOK continue_install
        Abort
        continue_install:
    ${EndIf}
FunctionEnd
