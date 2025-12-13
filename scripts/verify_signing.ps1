# Windows Signing Verification Script
# Verifies code signing for Windows artifacts
# Usage: .\verify_signing.ps1 [-ExePath] [-InstallerPath]

param(
    [string]$ExePath = "dist\CuePoint.exe",
    [string]$InstallerPath = "dist\CuePoint-v1.0.0-windows-x64-setup.exe"
)

$errors = @()

# Verify executable signing
if (Test-Path $ExePath) {
    Write-Host "Verifying executable signature: $ExePath"
    & signtool verify /pa /v $ExePath
    if ($LASTEXITCODE -ne 0) {
        $errors += "Executable signature verification failed"
    }
}
else {
    $errors += "Executable not found: $ExePath"
}

# Verify installer signing
if (Test-Path $InstallerPath) {
    Write-Host "Verifying installer signature: $InstallerPath"
    & signtool verify /pa /v $InstallerPath
    if ($LASTEXITCODE -ne 0) {
        $errors += "Installer signature verification failed"
    }
}
else {
    $errors += "Installer not found: $InstallerPath"
}

if ($errors.Count -gt 0) {
    Write-Error "Signing verification failed:"
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All signing verifications passed!"
