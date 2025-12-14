# Build Windows Installer
# Builds the Windows installer using NSIS

param(
    [Parameter(Mandatory = $false)]
    [string]$Version,
    
    [Parameter(Mandatory = $false)]
    [string]$DistDir = "dist",
    
    [Parameter(Mandatory = $false)]
    [switch]$Sign,
    
    [Parameter(Mandatory = $false)]
    [string]$CertPath,
    
    [Parameter(Mandatory = $false)]
    [string]$CertPassword,
    
    [Parameter(Mandatory = $false)]
    [string]$CertThumbprint
)

$ErrorActionPreference = "Stop"

# Get project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# Get version if not provided
if (-not $Version) {
    try {
        $versionFile = Join-Path $projectRoot "SRC\cuepoint\version.py"
        $versionContent = Get-Content $versionFile -Raw
        if ($versionContent -match '__version__\s*=\s*["'']([^"'']+)["'']') {
            $Version = $matches[1]
        }
        else {
            $Version = "1.0.0"
        }
    }
    catch {
        $Version = "1.0.0"
    }
}

Write-Host "Building Windows installer for version $Version" -ForegroundColor Cyan

# Check if NSIS is available
$makensis = "makensis"
try {
    $null = & $makensis /VERSION 2>&1
}
catch {
    Write-Error "NSIS (makensis) not found. Please install NSIS and add it to PATH."
    exit 1
}

# Check if dist directory exists
$distPath = Join-Path $projectRoot $DistDir
if (-not (Test-Path $distPath)) {
    Write-Error "Distribution directory not found: $distPath"
    Write-Host "Please build the executable first using: python scripts/build_pyinstaller.py"
    exit 1
}

# Check if CuePoint.exe exists
$exePath = Join-Path $distPath "CuePoint.exe"
if (-not (Test-Path $exePath)) {
    # Try one-directory mode
    $exePath = Join-Path (Join-Path $distPath "CuePoint") "CuePoint.exe"
    if (-not (Test-Path $exePath)) {
        Write-Error "CuePoint.exe not found in $distPath"
        Write-Host "Please build the executable first using: python scripts/build_pyinstaller.py"
        exit 1
    }
}

Write-Host "Found executable: $exePath" -ForegroundColor Green

# NSIS installer script
$installerScript = Join-Path $scriptDir "installer.nsi"
if (-not (Test-Path $installerScript)) {
    Write-Error "Installer script not found: $installerScript"
    exit 1
}

# Build installer
Write-Host "Building installer with NSIS..." -ForegroundColor Cyan
$outputDir = Join-Path $projectRoot $DistDir
$installerName = "CuePoint-Setup-v$Version.exe"

Push-Location $projectRoot
try {
    $buildCmd = "& `"$makensis`" /DVERSION=$Version `"$installerScript`""
    Write-Host "Running: $buildCmd"
    Invoke-Expression $buildCmd
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "NSIS build failed"
        exit 1
    }
}
finally {
    Pop-Location
}

# Check if installer was created
$installerPath = Join-Path $outputDir $installerName
if (-not (Test-Path $installerPath)) {
    Write-Error "Installer was not created: $installerPath"
    exit 1
}

Write-Host "Installer created: $installerPath" -ForegroundColor Green

# Sign installer if requested
if ($Sign) {
    Write-Host "Signing installer..." -ForegroundColor Cyan
    $signScript = Join-Path $scriptDir "sign_windows.ps1"
    
    $signArgs = @("-FilePath", $installerPath)
    if ($CertThumbprint) {
        $signArgs += @("-CertThumbprint", $CertThumbprint)
    }
    elseif ($CertPath) {
        $signArgs += @("-CertPath", $CertPath)
        if ($CertPassword) {
            $signArgs += @("-CertPassword", $CertPassword)
        }
    }
    else {
        Write-Error "Certificate path or thumbprint required for signing"
        exit 1
    }
    
    & $signScript @signArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Signing failed"
        exit 1
    }
    
    Write-Host "Installer signed successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Installer: $installerPath" -ForegroundColor Cyan
if ($Sign) {
    Write-Host "  Status: Signed" -ForegroundColor Green
}
else {
    Write-Host "  Status: Unsigned (use -Sign to sign)" -ForegroundColor Yellow
}
