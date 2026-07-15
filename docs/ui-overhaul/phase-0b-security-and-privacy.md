# Phase 0b — Security and privacy (user-facing)

## Purpose

Define how the **Electron + Python engine** architecture protects **the user** during normal use: **local attackers**, **other accounts on the machine**, **accidental data leakage** via logs and support bundles, and **supply chain** for updates. Implementation details live in code; this document is the **contract** implementers must satisfy.

**Prerequisites:** [phase-0-architecture.md](phase-0-architecture.md) (trust boundaries).

**Outcomes:** Threat model, localhost API rules, secrets handling, logging redaction policy, update trust, file-access rules—each with verifiable substeps.

---

## Problem statement and constraints

- **Problem:** A **localhost HTTP API** is convenient but is a common **footgun** (binding to all interfaces, missing auth, logging tokens).
- **Constraints:** Must work **offline** for core flows; **Beatport** requires HTTPS; **paths** may reveal identity (library names, usernames in paths).

---

## Goals vs non-goals

| Goals | Non-goals (0b) |
|--------|----------------|
| Document mitigations for localhost IPC | Formal penetration test sign-off |
| Align telemetry/support with current app | New analytics features |
| Clear redaction rules | WCAG compliance (mouse-first v1) |

---

## Threat model (lightweight STRIDE)

**Assumptions:** User runs CuePoint on a **single-user** workstation; primary adversaries are **malware on the same machine** and **mistaken trust in browser content** hitting `127.0.0.1`.

| Threat | Category | Example | Mitigation (summary) |
|--------|----------|---------|----------------------|
| Malware calls engine API | Spoofing / Elevation | Local process POSTs to engine | **Token** required on every request; token in **memory** only; **rotate** on engine restart |
| Token in logs | Information disclosure | Logger prints `Authorization` | **Never** log token; structured logging review |
| Engine listens on LAN | Information disclosure | Bind `0.0.0.0` | Bind **`127.0.0.1` only** |
| Browser extension hits localhost | Tampering | `fetch('http://127.0.0.1:...')` | **Origin not trusted**; still require **token**; consider **Referer** checks (optional) |
| Replay of captured requests | Tampering | Old POST replayed | Short-lived token + optional **nonce** for destructive ops (document in Phase 3) |
| Malicious update binary | Tampering | Fake installer | **Signed** updates (Phase 9); verify channel |

**Trust boundaries (recap):**

| Boundary | Trust level | Rule |
|----------|-------------|------|
| Renderer ↔ Main | Medium | Expose **minimal** API via `contextBridge` |
| Main ↔ Engine | Medium-High | **Authenticated** HTTP only |
| Engine ↔ filesystem | User-delegated | **Only** user-selected paths and explicit outputs |
| Engine ↔ Beatport | High (TLS) | Existing HTTPS client; pin expectations in code review |

---

## Security requirements (normative SHALL statements)

These are **specification**-level. Implementation reviews SHOULD verify each with **code reference** or **test**.

| ID | Requirement |
|----|-------------|
| **SEC-01** | The engine HTTP listener SHALL bind only to **IPv4 loopback** `127.0.0.1` unless a future ADR documents IPv6 `::1` with equivalent access control. |
| **SEC-02** | Every mutating or data-bearing API call (except an explicitly documented **bootstrap** health check) SHALL require a valid **session token**. |
| **SEC-03** | The session token SHALL NOT appear in persistent renderer storage by default. |
| **SEC-04** | Logs and support bundles SHALL NOT contain the session token, `Authorization` headers, or Beatport cookies. |
| **SEC-05** | File operations SHALL use paths originating from **user intent** (dialogs or explicit paste) and SHALL normalize and reject traversal patterns where feasible. |
| **SEC-06** | Update artifacts SHALL be obtained only from **trusted channels** defined in Phase 9 (signatures / checksums). |

---

## Control-to-threat mapping

Maps **STRIDE rows** to **concrete controls** (defense in depth). “Partial” means reduces impact but does not eliminate threat class.

| Threat row | Primary controls | Coverage |
|------------|------------------|----------|
| Malware calls engine API | SEC-01, SEC-02, token rotation on restart | Partial (local malware is inside TCB) |
| Token in logs | SEC-04, log pipeline review | High |
| Engine on LAN | SEC-01 | High (for network exposure) |
| Browser extension localhost | SEC-02, avoid predictable ports (optional) | Partial |
| Replay | Short-lived token; optional nonce for destructive ops (Phase 3) | Partial |
| Malicious update | SEC-06 | High (supply chain) |

---

## Attack surface inventory (local)

| Surface | Exposed to | Data at risk |
|---------|------------|--------------|
| Engine HTTP | Any local process | Job control, file paths, partial library metadata |
| Engine WebSocket/SSE | Same | Streaming progress, log snippets |
| Electron preload API | Renderer JS | Whatever Main forwards—keep minimal |
| Local log files | Same user + backups | Paths, errors |
| Support bundle zip | User-chosen share target | As configured in Phase 7 |

---

## Privacy impact summary

| Data class | Typical sensitivity | Default handling |
|------------|---------------------|------------------|
| Rekordbox paths | High (username in path) | Redact in default logs; full path debug opt-in |
| Track / playlist names | Medium–High | Same policy as current app (parity) |
| Beatport credentials | Critical | Engine-only storage; never renderer |
| Telemetry events | Low–Medium | Enumerate in docs; user controls per current behavior |

---

## Residual risk statement

**Residual risk:** Malware with **user privileges** can invoke the engine if it **obtains the session token** from process memory or by injecting into Electron. CuePoint **cannot** fully defend against a compromised workstation; controls aim to **prevent accidental exposure**, **reduce blast radius**, and **avoid trivial** remote or cross-user access.

---

## Localhost service hardening (normative)

1. **Bind address:** `127.0.0.1` **only** (IPv4 loopback). Do **not** bind `::` or `0.0.0.0` unless explicitly justified and reviewed.
2. **Port:** Prefer **random high port** selected at startup **or** fixed port with **single-instance** lock; document conflict behavior.
3. **Authentication:** Every API request must include a **Bearer token** (or equivalent header) known only to Main + Engine after handshake. **Never** persist token in renderer `localStorage` unless product explicitly requires it (default: **no**).
4. **Handshake:** Main spawns Engine, reads **stdout or IPC file** for **port + token** (or uses env passed only to child), then passes token to Renderer via **preload** only if needed (prefer Main proxying sensitive calls).
5. **Logging:** Log **port** only at debug level; **never** log token.
6. **CSRF:** Not applicable to non-browser clients; **browser** extensions are mitigated by token + localhost-only binding.

---

## Secrets in memory and storage

| Secret | Storage rule | Notes |
|--------|--------------|------|
| Beatport token / cookie | Existing **prefs** / secure patterns in Python | **Do not** duplicate in Electron `localStorage` without explicit ADR |
| GitHub token (error reporting) | Env / existing prefs | Same |
| Engine API token | **Process memory** only; rotate on restart | Renderer should not need raw token if Main proxies |

---

## Data sensitivity and log redaction

**Sensitive fields:** Full filesystem paths (may include username), playlist names, **track titles** (if user considers private), **email** in crash reports.

**Policy (implement in Phase 7 with this intent):**

- Default logs: **hash or basename** optional for paths in user-facing logs; full paths only in **debug** with explicit opt-in.
- Support bundle: **manifest** listing what is included; **scrub** tokens and cookies.
- **Telemetry:** Document events and fields (parity with current behavior); no new PII without ADR.

---

## Updates

- **Electron:** Use established **signed** update channel (e.g. `electron-updater`) per Phase 9.
- **Engine:** Version **must** be compatible with shell; **block** or **warn** on mismatch (ADR in Phase 4/9).
- **Python dependencies:** Locked in build; SBOM optional (Phase 9).

---

## File access (least privilege)

- **Renderer:** No direct file read/write; use **Main** dialogs (`showOpenDialog`, `showSaveDialog`) and pass **paths** to Engine only as user intent.
- **Engine:** Open only paths **passed by API**; reject path traversal (`..`) and unexpected roots where applicable.
- **Exports:** Write only to **user-chosen** output paths.

---

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| stdio JSON only | No TCP | Awkward for concurrent UI + streaming |
| **HTTP + token** (chosen) | Testable, OpenAPI | Must harden |
| Unix socket / named pipe | No port | Cross-platform complexity |

---

## Traceability

| 0b topic | Phase |
|----------|-----|
| Token handshake | 3, 4 |
| Redaction | 7 |
| Updates | 9 |

---

## Measurable acceptance criteria

- [ ] Each **SEC-xx** requirement has an **owner** and **verification method** (test, grep, or manual checklist) recorded in Phase 8/9.
- [ ] Threat model and **control mapping** reviewed in the same PR as first engine HTTP listener.
- [ ] “Never log token” is a **CI grep** or checklist item (Phase 0c / 9).
- [ ] Engine bind address verified in code review (static search for `0.0.0.0` and `::`).
- [ ] **Privacy impact summary** cross-checked against actual telemetry and bundle code paths before release.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token leaked via renderer devtools | Med | High | Minimize token in renderer; Main proxy |
| User runs two copies | Low | Med | Single-instance + port conflict doc |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 0b.1 | Add Phase 0b document | `docs(ui-overhaul): add phase 0b security and privacy` | Linked from README |
| 0b.2 | Add security checklist to Phase 7 cross-reference | `docs(ui-overhaul): link security policy to observability phase` | Phase 7 references 0b |
| 0b.3 | Add “no token in logs” to contributing or security snippet | `docs: document localhost API logging policy` | grep / review in CI |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added SHALL requirements, control mapping, attack surface, privacy impact, residual risk | — |
