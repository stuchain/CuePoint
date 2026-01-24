## Step 8: Security, Privacy and Compliance (Ship v1.0)

**Implementation Order**: This is the **eighth step** - should be considered throughout, formalized here.

### Step 8.1: Threat Model (Practical)

**8.1.1 Threat Categories**
- Update tampering (MITM, malicious release asset)
- Credential/token leakage (logs/config)
- Corrupt/malicious input files
- Scraping endpoints returning unexpected/hostile content

**8.1.2 Assets to Protect**
- **Update channel integrity**: users only install authentic CuePoint releases.
- **User local data**:
  - collection XML paths (may be sensitive)
  - exported CSV/Excel/JSON
  - caches and logs (may reveal listening habits)
- **System stability**:
  - no app crashes from malformed data
  - no runaway network behavior

**8.1.3 Trust Boundaries**
- Local machine boundary: app data directory and exports.
- Network boundary: Beatport and search endpoints; treat as untrusted.
- Update boundary: appcast + release assets; must be authenticated.

### Step 8.2: Secure Defaults

**8.2.1 Security Defaults**
- Always use HTTPS verification.
- Timeouts enabled.
- Don't store secrets unencrypted.
- Avoid logging full URLs with tokens/PII (if any).

**8.2.2 Dependency Safety**
- Pin dependencies for shipped builds (avoid surprise upgrades).
- Run dependency vulnerability scanning in CI (e.g., pip-audit).
- Prefer well-maintained libraries; remove unused heavy deps.

### Step 8.3: Update Security (Must-Have)

**8.3.1 Update Integrity**
- Update feed over HTTPS.
- Verify signatures or checksums.
- Show publisher identity (signed app).
- Ability to revoke a bad release (remove appcast entry).

**8.3.2 Recommended Update Integrity Model**
- macOS:
  - Sparkle signatures on update packages
  - signed appcast (recommended)
- Windows:
  - signed installer (signtool + timestamp)
  - checksum validation from appcast

**8.3.3 Key Management**
- Keep signing keys out of repo.
- CI uses encrypted secrets + ephemeral keychains.
- Rotate keys if compromise suspected; revoke bad releases in appcast.

### Step 8.4: Privacy Posture

**8.4.1 Privacy Defaults**
- By default:
  - store everything locally
  - no telemetry
- If telemetry is added later:
  - opt-in only
  - documented and minimal

**8.4.2 Privacy UX Requirements**
- Provide "Privacy" page in-app:
  - what network requests occur
  - what is stored locally (cache/logs/exports)
  - how to clear stored data

### Step 8.5: Legal/Compliance Notes

**8.5.1 Third-Party Compliance**
- Respect third-party TOS for scraping.
- Include third-party licenses for dependencies in the distributed app.
- Provide a simple privacy notice in-app (Help → Privacy).

**8.5.2 License Compliance Workflow**
- During packaging, generate a "Third‑party licenses" file:
  - list dependency name/version/license
  - include license text where required
- Include it inside the app distribution:
  - macOS: inside `.app/Contents/Resources/`
  - Windows: in install directory + Start menu link
