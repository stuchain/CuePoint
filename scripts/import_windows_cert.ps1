# Import Windows signing certificate
# Used in CI to import certificate from GitHub Secrets

param(
    [Parameter(Mandatory = $true)]
    [string]$CertBase64,
    
    [Parameter(Mandatory = $true)]
    [string]$CertPassword,
    
    [Parameter(Mandatory = $false)]
    [string]$CertPath = "cert.pfx"
)

Write-Host "Decoding certificate..."
try {
    $certBytes = [System.Convert]::FromBase64String($CertBase64)
    [System.IO.File]::WriteAllBytes($CertPath, $certBytes)
    Write-Host "Certificate saved to: $CertPath"
}
catch {
    Write-Error "Failed to decode certificate: $_"
    exit 1
}

Write-Host "Validating certificate..."
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath, $CertPassword)
    Write-Host "Certificate validated: $($cert.Subject)"
    Write-Host "Certificate expires: $($cert.NotAfter)"
    
    if ($cert.NotAfter -lt (Get-Date)) {
        Write-Error "Certificate has expired"
        exit 1
    }
}
catch {
    Write-Error "Failed to validate certificate: $_"
    exit 1
}

Write-Host "Certificate imported successfully"
