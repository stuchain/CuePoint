# PowerShell Update Launcher Script for Windows
# This script closes CuePoint, then launches the installer,
# waits for installation to complete, and optionally reopens the app.

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,
    
    [Parameter(Mandatory = $false)]
    [string]$AppPath = ""
)

Write-Host "========================================"
Write-Host "CuePoint Update Installer"
Write-Host "========================================"
Write-Host ""

# Verify installer exists
if (-not (Test-Path $InstallerPath)) {
    Write-Host "Error: Installer not found at: $InstallerPath"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Installer: $InstallerPath"
Write-Host ""

# Step 1: Close CuePoint if it's running
Write-Host "Checking if CuePoint is running..."
$cuepointProcess = Get-Process -Name "CuePoint" -ErrorAction SilentlyContinue

if ($cuepointProcess) {
    Write-Host "CuePoint is running. Closing it..."
    Write-Host "Process ID: $($cuepointProcess.Id)"
    
    # Try graceful close first
    $cuepointProcess.CloseMainWindow()
    
    # Wait for process to close (max 10 seconds)
    $waited = 0
    while ($cuepointProcess.HasExited -eq $false -and $waited -lt 10) {
        Start-Sleep -Milliseconds 500
        $waited += 0.5
        $cuepointProcess.Refresh()
    }
    
    # If still running, force kill
    if (-not $cuepointProcess.HasExited) {
        Write-Host "CuePoint did not close gracefully. Force closing..."
        Stop-Process -Id $cuepointProcess.Id -Force
        Start-Sleep -Seconds 1
    }
    
    Write-Host "CuePoint has been closed."
    Write-Host ""
}
else {
    Write-Host "CuePoint is not running."
    Write-Host ""
}

# Step 2: Launch installer (visible, no silent mode)
Write-Host "========================================"
Write-Host "Starting Installation..."
Write-Host "========================================"
Write-Host ""
Write-Host "The installer window will now appear."
Write-Host "Please follow the installation prompts."
Write-Host ""

# Launch installer and wait for completion
$installerProcess = Start-Process -FilePath $InstallerPath -ArgumentList "/UPGRADE" -Wait -PassThru

$installerExitCode = $installerProcess.ExitCode

Write-Host ""
Write-Host "========================================"
if ($installerExitCode -eq 0) {
    Write-Host "Installation completed successfully!"
}
else {
    Write-Host "Installation completed with exit code: $installerExitCode"
    Write-Host "The installation may not have completed successfully."
}
Write-Host "========================================"
Write-Host ""

# Helper: wait for file to exist and stabilize (size stops changing)
function Wait-ForStableFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [int]$MinSizeMB = 10,
        [int]$TimeoutSec = 20
    )
    $minBytes = $MinSizeMB * 1024 * 1024
    $elapsed = 0
    $lastSize = -1
    $stableCount = 0
    while ($elapsed -lt $TimeoutSec) {
        if (Test-Path $Path) {
            $size = (Get-Item $Path).Length
            if ($size -ge $minBytes) {
                if ($size -eq $lastSize) {
                    $stableCount += 1
                }
                else {
                    $stableCount = 0
                    $lastSize = $size
                }
                if ($stableCount -ge 2) {
                    return $true
                }
            }
        }
        Start-Sleep -Seconds 1
        $elapsed += 1
    }
    return $false
}

# Step 3: Ask if user wants to reopen
if (-not $AppPath) {
    # Try to find app in default location
    $AppPath = "$env:LOCALAPPDATA\CuePoint\CuePoint.exe"
}

if (Test-Path $AppPath) {
    $response = Read-Host "Do you want to reopen CuePoint now? (Y/N)"
    if ($response -eq "Y" -or $response -eq "y") {
        Write-Host ""
        Write-Host "Launching CuePoint..."
        
        # Get the directory containing the executable (important for PyInstaller apps)
        $AppDirectory = Split-Path -Parent $AppPath
        
        # Wait for the installed exe to be present and stable on disk
        $ready = Wait-ForStableFile -Path $AppPath -MinSizeMB 10 -TimeoutSec 20
        if (-not $ready) {
            Write-Host "Warning: CuePoint.exe did not appear stable on disk yet."
            Write-Host "Skipping auto-relaunch. Please start CuePoint manually."
            Write-Host ""
            Write-Host "Update launcher will close in 5 seconds..."
            Start-Sleep -Seconds 5
            exit 0
        }
        
        # Launch with working directory set to app directory
        # This ensures PyInstaller can find the DLL and other resources
        # Use -NoNewWindow to ensure proper environment inheritance
        Start-Process -FilePath $AppPath -WorkingDirectory $AppDirectory -NoNewWindow
        
        Write-Host "CuePoint launched!"
    }
    else {
        Write-Host ""
        Write-Host "CuePoint will not be reopened. You can launch it manually when ready."
    }
}
else {
    Write-Host ""
    Write-Host "Could not find CuePoint at: $AppPath"
    Write-Host "Please launch it manually."
}

Write-Host ""
Write-Host "Update launcher will close in 5 seconds..."
Start-Sleep -Seconds 5
