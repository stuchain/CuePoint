# Sign Windows executable or installer
# Enhanced signing script with comprehensive error handling and verification

param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    
    [Parameter(Mandatory = $false)]
    [string]$CertPath,
    
    [Parameter(Mandatory = $false)]
    [string]$CertPassword,
    
    [Parameter(Mandatory = $false)]
    [string]$CertThumbprint,
    
    [Parameter(Mandatory = $false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipVerification
)

# Error handling
$ErrorActionPreference = "Stop"

function Write-Error-Exit {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Write-Info {
    param([string]$Message)
    Write-Host "INFO: $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "SUCCESS: $Message" -ForegroundColor Green
}

# Validate inputs
if (-not (Test-Path $FilePath)) {
    Write-Error-Exit "File not found: $FilePath"
}

$fileInfo = Get-Item $FilePath
Write-Info "Signing file: $($fileInfo.FullName)"
Write-Info "File size: $([math]::Round($fileInfo.Length / 1MB, 2)) MB"

# Determine signing method
if ($CertThumbprint) {
    # Use certificate from store by thumbprint
    Write-Info "Using certificate from store (thumbprint: $CertThumbprint)"
    $signMethod = "store"
    $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $CertThumbprint }
    if (-not $cert) {
        Write-Error-Exit "Certificate with thumbprint $CertThumbprint not found in certificate store"
    }
    $signCmd = "signtool sign /sha1 $CertThumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /v `"$FilePath`""
}
elseif ($CertPath) {
    # Use certificate file
    if (-not (Test-Path $CertPath)) {
        Write-Error-Exit "Certificate file not found: $CertPath"
    }
    Write-Info "Using certificate file: $CertPath"
    $signMethod = "file"
    if (-not $CertPassword) {
        Write-Error-Exit "Certificate password required when using certificate file"
    }
    $signCmd = "signtool sign /f `"$CertPath`" /p `"$CertPassword`" /fd SHA256 /tr $TimestampServer /td SHA256 /v `"$FilePath`""
}
else {
    Write-Error-Exit "Either CertPath or CertThumbprint must be provided"
}

# Sign the file
Write-Info "Signing with signtool..."
try {
    if ($signMethod -eq "store") {
        & signtool sign /sha1 $CertThumbprint /fd SHA256 /tr $TimestampServer /td SHA256 /v "$FilePath"
    }
    else {
        & signtool sign /f "$CertPath" /p "$CertPassword" /fd SHA256 /tr $TimestampServer /td SHA256 /v "$FilePath"
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Exit "Signing failed with exit code $LASTEXITCODE"
    }
    Write-Success "File signed successfully"
}
catch {
    Write-Error-Exit "Signing failed: $_"
}

# Verify signature
if (-not $SkipVerification) {
    Write-Info "Verifying signature..."
    try {
        $verifyOutput = & signtool verify /pa /v "$FilePath" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Verification output:" -ForegroundColor Yellow
            Write-Host $verifyOutput
            Write-Error-Exit "Signature verification failed"
        }
        Write-Success "Signature verified successfully"
        
        # Display signature information
        Write-Info "Signature details:"
        $verifyOutput | Select-String -Pattern "Signing certificate" | ForEach-Object { Write-Host "  $_" }
        $verifyOutput | Select-String -Pattern "Timestamp" | ForEach-Object { Write-Host "  $_" }
    }
    catch {
        Write-Error-Exit "Verification failed: $_"
    }
}
else {
    Write-Info "Skipping verification (requested)"
}

Write-Success "Signing process completed successfully"
