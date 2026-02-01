# Security Gate Checklist (Design 4)

Pre-release security checks per Step 4: Security and Privacy Design.

## Checklist (Design 4.21, 4.106)

- [ ] **Dependency scan passes** – CI runs `pip-audit` on requirements (Design 4.82, 4.133).
- [ ] **Bandit scan** – CI runs Bandit on `SRC/` (Design 4.133).
- [ ] **Logs redacted** – `LogSanitizer.sanitize_path` / `sanitize_message` redact user paths and secrets (Design 4.11, 4.79).
- [ ] **Update signatures validated** – Appcast items without checksum are skipped; downloaded artifact is verified before install (Design 4.9, 4.36, 4.57).
- [ ] **Secure defaults** – Config: `redact_paths_in_logs`, `verify_updates`, `enforce_https` default True (Design 4.48, 4.81, 4.101).
- [ ] **Safe XML** – Rekordbox parser caps XML file size (Design 4.70); oversized file rejected.
- [ ] **Privacy UX** – Help → Privacy: Clear Cache, Clear Logs, Open Data Folder, View Privacy Notice (Design 4.39, 4.12).

## Implementation

- **Update integrity**: `update_checker.py` skips items without `checksum`; `main_window.py` verifies SHA-256 of downloaded file before install.
- **HTTPS**: `FeedIntegrityVerifier` enforces HTTPS for feed and download URLs.
- **Log redaction**: `cuepoint.utils.logger.LogSanitizer` redacts paths (home dir → `~`) and sensitive keys.
- **Privacy UX**: Help → Privacy dialog; Clear Cache, Clear Logs, Clear all, **Open Data Folder**; privacy notice from `DOCS/POLICY/privacy-notice.md`.
- **Security error codes**: `SRC/cuepoint/update/security.py` defines S001–S003, S010 and `SecurityError` (Design 4.23, 4.124).
- **Config defaults**: `ProductConfig`: `redact_paths_in_logs`, `verify_updates`, `enforce_https` default True (Design 4.48, 4.115).
- **Safe XML**: `rekordbox.parse_rekordbox` checks file size against `MAX_XML_SIZE_BYTES` (100 MiB) before parse (Design 4.70).

## Tests

- `SRC/tests/unit/update/test_update_security.py` – HTTPS, checksum, file size; missing checksum skips update; item with checksum accepted.
- `SRC/tests/unit/utils/test_step6_logging.py` – `TestLogSanitizerPathRedaction`: path redaction (home, USERPROFILE, Unix).
- `SRC/tests/unit/test_secure_defaults.py` – Redaction, verify_updates, enforce_https on by default (Design 4.81).
- `SRC/tests/unit/data/test_rekordbox.py` – `test_parse_rekordbox_rejects_oversized_xml`: XML size cap (Design 4.70).

See also: [04-security-and-privacy.md](../prerelease/designs/04-security-and-privacy.md), [security-response-process.md](./security-response-process.md).
