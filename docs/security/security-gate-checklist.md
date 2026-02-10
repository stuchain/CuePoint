# Security Gate Checklist

Pre-release security checks.

## Checklist

- [ ] **Dependency scan passes** – CI runs `pip-audit` on requirements.
- [ ] **Bandit scan** – CI runs Bandit on `src/`.
- [ ] **Logs redacted** – `LogSanitizer.sanitize_path` / `sanitize_message` redact user paths and secrets.
- [ ] **Update signatures validated** – Appcast items without checksum are skipped; downloaded artifact is verified before install.
- [ ] **Secure defaults** – Config: `redact_paths_in_logs`, `verify_updates`, `enforce_https` default True.
- [ ] **Safe XML** – Rekordbox parser caps XML file size; oversized file rejected.
- [ ] **Privacy UX** – Help → Privacy: Clear Cache, Clear Logs, Open Data Folder, View Privacy Notice.

## Implementation

- **Update integrity**: `update_checker.py` skips items without `checksum`; `main_window.py` verifies SHA-256 of downloaded file before install.
- **HTTPS**: `FeedIntegrityVerifier` enforces HTTPS for feed and download URLs.
- **Log redaction**: `cuepoint.utils.logger.LogSanitizer` redacts paths (home dir → `~`) and sensitive keys.
- **Privacy UX**: Help → Privacy dialog; Clear Cache, Clear Logs, Clear all, **Open Data Folder**; privacy notice from `docs/policy/privacy-notice.md`.
- **Security error codes**: `src/cuepoint/update/security.py` defines S001–S003, S010 and `SecurityError`.
- **Config defaults**: `ProductConfig`: `redact_paths_in_logs`, `verify_updates`, `enforce_https` default True.
- **Safe XML**: `rekordbox.parse_rekordbox` checks file size against `MAX_XML_SIZE_BYTES` (100 MiB) before parse.

## Tests

- `src/tests/unit/update/test_update_security.py` – HTTPS, checksum, file size; missing checksum skips update; item with checksum accepted.
- `src/tests/unit/utils/test_step6_logging.py` – `TestLogSanitizerPathRedaction`: path redaction (home, USERPROFILE, Unix).
- `src/tests/unit/test_secure_defaults.py` – Redaction, verify_updates, enforce_https on by default.
- `src/tests/unit/data/test_rekordbox.py` – `test_parse_rekordbox_rejects_oversized_xml`: XML size cap.

See also: [security-response-process.md](security-response-process.md).
