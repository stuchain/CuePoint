# Phase 0c — Repository and developer hygiene

## Purpose

Prevent **personal**, **secret**, or **machine-specific** artifacts from being committed: Rekordbox exports, real library paths, **Beatport tokens**, **signing keys**, scratch **design files** with embedded notes, and **crash dumps** with PII. This complements [phase-0b-security-and-privacy.md](phase-0b-security-and-privacy.md) (runtime security).

**Prerequisites:** None (can apply immediately to repo policy).

**Outcomes:** `.gitignore` patterns, optional **pre-commit** hooks, **CI secret scanning**, contributor workflow, **design asset** policy.

---

## Problem statement and constraints

- **Problem:** DJs work with **real track lists** and **paths**; it is easy to commit a **test XML** or **screenshot** that leaks privacy.
- **Constraint:** Documentation and pixel art sources may live beside the repo during design; **only sanitized exports** belong in git.

---

## Goals vs non-goals

| Goals | Non-goals |
|--------|-----------|
| Block common secret patterns | Full DLP for corporate data |
| Document safe workflow | Replacing code review |

---

## Data classification (for commits and PRs)

| Class | Definition | Examples | Allowed in public repo? |
|-------|------------|----------|-------------------------|
| **Public** | Safe to share worldwide | Docs, sanitized fixtures, licensed fonts |
| **Internal** | Non-secret but project-specific | Build scripts, CI config without secrets |
| **Confidential** | User or business sensitive | Real Rekordbox XML, paths with username |
| **Secret** | Credentials / keys | Tokens, `.pem`, signing keys |

**Rule:** Only **Public** and **Internal** without embedded **Confidential** data belong on the default branch.

---

## Control stack and expected effectiveness

| Control | Type | What it catches | Limitation |
|---------|------|-----------------|------------|
| `.gitignore` | Preventive | WIP folders, `.env`, dumps | Does not stop `git add -f` |
| Pre-commit secret scan | Preventive | Known token patterns | Novel encodings, images with embedded text |
| CI secret scan | Detective | Same, on PR | Late feedback |
| PR human review | Corrective | Context (screenshots, XML structure) | Labor-intensive |

**Conclusion:** **Layered** controls; none replace **reviewer judgment** for DJ-domain data.

---

## PR review rubric (hygiene)

Reviewers SHOULD verify:

1. **No** absolute home paths (`/Users/`, `C:\Users\`, `/home/`) in new text fixtures or screenshots.
2. **No** API keys or `Bearer` strings in diff.
3. **Images:** if UI screenshots, **blur** path bars or use **sample** library.
4. **New env vars:** only appear in **`.env.example`** with placeholder values.

---

## Inventory of sensitive patterns (do not commit)

| Category | Examples | Mitigation |
|----------|----------|------------|
| Rekordbox / library exports | `*.xml` from Rekordbox with real paths | Use **fixtures** with fake names; **anonymize** |
| Tokens | `.env`, `BEATPORT_*`, cookies | **`.env.example`** only; `.env` in `.gitignore` |
| Paths | `C:\Users\RealName\...` | **Search** before push; CI optional path detector |
| Signing keys | `.p12`, `.pem`, keystores | **`.gitignore`**; store in secure vault |
| Large caches | `node_modules/`, `.venv`, build dirs | Ignore; document in README |
| **Design WIP** | Aseprite/PSD with personal notes | **Export PNG** to repo; keep `.ase` private or use `*-local.*` |
| Crash dumps | `*.dmp` with memory | Ignore |

---

## `.gitignore` / naming policy

**Recommended additions** (adjust to project conventions):

```
# Local env and secrets
.env
.env.*
!.env.example

# UI overhaul local design (example)
docs/ui-overhaul/design/wip/
*-local.*
*.ase
*.psd

# OS / IDE (if not already covered)
Thumbs.db
Desktop.ini
```

**Naming convention:** Files meant only for one machine: `something-local.png` or under `wip/` (gitignored).

---

## Pre-commit and CI guards

| Layer | Tool | Purpose |
|-------|------|---------|
| **Pre-commit (optional)** | `gitleaks` / `trufflehog` / custom script | Block secrets before commit |
| **CI** | Same scanners on PR | Catch bypasses |
| **Simple grep** | Reject `BEGIN PRIVATE KEY`, `ghp_`, long base64 tokens | Cheap baseline |

**Suggested commit** when adding CI: `ci: add secret scanning workflow for pull requests`

---

## Contributor workflow (“safe share”)

1. **Before `git add`:** Run `git status` and diff; **no** home paths in new files.
2. **Secrets:** Use **environment variables**; never paste tokens into markdown or tests.
3. **Fixtures:** Use **fake** artist/track names; **copy** structure only from Rekordbox exports.
4. **Screenshots:** Crop or replace path bars; use **sample** data.
5. **Design:** Commit **PNG/SVG** atlas slices; keep **source** `.ase` out of repo unless cleared.

---

## Design asset policy

- **In repo:** PNG/WebP sprites, **9-slice** metadata, **JSON** atlas descriptors, **licensed** pixel font files with **license** file.
- **Out of repo:** Raw **Aseprite** with personal project notes; **unlicensed** font sources; **WIP** larger than reviewable in PR.
- **Documentation:** Phase 1 lists **font license** and **palette** derivation.

---

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Git LFS for all art | Large files | Cost, complexity |
| **Gitignore WIP + commit exports** (chosen) | Simple | Manual discipline |

---

## Traceability

| 0c topic | Phase |
|----------|-----|
| Ignore patterns | 1 (assets), 9 (CI) |
| Secret scanning | 9 |

---

## Measurable acceptance criteria

- [ ] `.gitignore` updated with **ui-overhaul** / local design paths.
- [ ] `README` or `CONTRIBUTING` links to **safe share** checklist and **PR rubric** (this doc or excerpt).
- [ ] CI runs **secret scan** on PR (or documented manual step if CI deferred).
- [ ] At least one **dry-run** PR exercise: intentionally add a fake `ghp_` string and confirm CI fails.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Contributor ignores WIP rules | PR review + optional path allowlist |
| False positives in secret scanner | Tune allowlist |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 0c.1 | Add Phase 0c document | `docs(ui-overhaul): add phase 0c repository hygiene` | Linked from README |
| 0c.2 | Extend `.gitignore` for ui overhaul wip and local files | `chore(security): gitignore ui overhaul local design assets` | `git check-ignore` |
| 0c.3 | Add `.env.example` entries for future Electron/engine (no secrets) | `chore: add env example placeholders for desktop shell` | File exists, `.env` ignored |
| 0c.4 | Add gitleaks/trufflehog config or link to GitHub secret scanning | `ci: add secret scanning configuration` | Workflow runs |
| 0c.5 | Document safe contributor checklist in `CONTRIBUTING.md` or `docs/` | `docs: add safe commit checklist for contributors` | Link from README |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial version | — |
| 2026-04-03 | Added data classification, control effectiveness, PR rubric | — |
