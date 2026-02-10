# Root directory cleanup — options

Ways to make the repo root cleaner. **Done** = already applied.

---

## Done

- **`_fix_checklist.py`** → `scripts/fix_checklist.py` — One-off checklist script; no refs. Path inside script updated for `docs/future-features/...`.
- **`config.yaml.template`** → `config/config.yaml.template` — Template is reference only (app uses `config_dir()/config.yaml`). Doc and error messages updated.
- **`benchmarks/`** → `scripts/benchmarks/` — Moved; `scripts/bench.py` and docs (user-guide/performance.md, future-features design 06) updated.
- **`build/` and `dist/`** — Already in `.gitignore`; left at root, not tracked.

---

## Decisions (keep at root)

1. **Launchers: `run_gui.sh`, `run_gui.command`, `run_gui.bat`** — Keep at root (one-place launchers for “double-click to run”).
2. **Requirements: `requirements*.txt` (4 files)** — Keep at root (standard for Python; pip and CI expect them here).
3. **Config / tool config: `.coveragerc`, `.pylintrc`, `mypy.ini`, `pytest.ini`** — Keep at root so tools find them without extra flags.
4. **`PRIVACY_NOTICE.md`** — Keep at root (high visibility for legal).

---

## Summary

- **Moved:** `_fix_checklist.py` → `scripts/fix_checklist.py`; `config.yaml.template` → `config/config.yaml.template`; `benchmarks/` → `scripts/benchmarks/`.
- **Kept at root:** Launchers, requirements, tool config, PRIVACY_NOTICE.md.
- **Gitignored:** `build/`, `dist/` (already in `.gitignore`).

You can delete this file once you’ve finished cleanup; or keep it as a record.
