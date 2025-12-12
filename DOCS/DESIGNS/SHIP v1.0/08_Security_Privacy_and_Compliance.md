## 8. Security, Privacy & Compliance (Ship v1.0)

### 8.1 Threat model (practical)
- Update tampering (MITM, malicious release asset)
- Credential/token leakage (logs/config)
- Corrupt/malicious input files
- Scraping endpoints returning unexpected/hostile content

### 8.1.1 Assets to protect
- **Update channel integrity**: users only install authentic CuePoint releases.
- **User local data**:
  - collection XML paths (may be sensitive)
  - exported CSV/Excel/JSON
  - caches and logs (may reveal listening habits)
- **System stability**:
  - no app crashes from malformed data
  - no runaway network behavior

### 8.1.2 Trust boundaries
- Local machine boundary: app data directory and exports.
- Network boundary: Beatport and search endpoints; treat as untrusted.
- Update boundary: appcast + release assets; must be authenticated.

### 8.2 Secure defaults
- Always use HTTPS verification.
- Timeouts enabled.
- Don’t store secrets unencrypted.
- Avoid logging full URLs with tokens/PII (if any).

### 8.2.1 Dependency safety
- Pin dependencies for shipped builds (avoid surprise upgrades).
- Run dependency vulnerability scanning in CI (e.g., pip-audit).
- Prefer well-maintained libraries; remove unused heavy deps.

### 8.3 Update security (must-have)
- Update feed over HTTPS.
- Verify signatures or checksums.
- Show publisher identity (signed app).
- Ability to revoke a bad release (remove appcast entry).

### 8.3.1 Recommended update integrity model
- macOS:
  - Sparkle signatures on update packages
  - signed appcast (recommended)
- Windows:
  - signed installer (signtool + timestamp)
  - checksum validation from appcast

### 8.3.2 Key management
- Keep signing keys out of repo.
- CI uses encrypted secrets + ephemeral keychains.
- Rotate keys if compromise suspected; revoke bad releases in appcast.

### 8.4 Privacy posture
- By default:
  - store everything locally
  - no telemetry
- If telemetry is added later:
  - opt-in only
  - documented and minimal

### 8.4.1 Privacy UX requirements
- Provide “Privacy” page in-app:
  - what network requests occur
  - what is stored locally (cache/logs/exports)
  - how to clear stored data

### 8.5 Legal/compliance notes
- Respect third-party TOS for scraping.
- Include third-party licenses for dependencies in the distributed app.
- Provide a simple privacy notice in-app (Help → Privacy).

### 8.5.1 License compliance workflow
- During packaging, generate a “Third‑party licenses” file:
  - list dependency name/version/license
  - include license text where required
- Include it inside the app distribution:
  - macOS: inside `.app/Contents/Resources/`
  - Windows: in install directory + Start menu link


