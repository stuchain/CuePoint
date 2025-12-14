# Sign Windows executable or installer

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$true)]
    [string]$CertPath,
    
    [Parameter(Mandatory=$true)]
    [string]$CertPassword
)

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

if (-not (Test-Path $CertPath)) {
    Write-Error "Certificate not found: $CertPath"
    exit 1
}

Write-Host "Signing: $FilePath"

# Sign with signtool
signtool sign /f $CertPath /p $CertPassword /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "$FilePath"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Signing failed"
    exit 1
}

# Verify signing
Write-Host "Verifying signature..."
signtool verify /pa /v "$FilePath"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Verification failed"
    exit 1
}

Write-Host "Signing complete"
