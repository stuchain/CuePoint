# CuePoint repository guidance

Use this as an operational map, not a product manual. Load only the files needed for the task.

## First actions

- Run `git status --short`; preserve unrelated user changes.
- Search with `rg`/`rg --files` before opening broad directories.
- Prefer current code, package scripts, test config, and CI over prose when they disagree.
- Treat `docs/development/archive/` and `docs/ui-overhaul/tracking/` as historical context.
- Skip lockfiles, binaries, generated output, and large fixtures unless directly relevant.

## Architecture

CuePoint enriches Rekordbox playlists with Beatport metadata. Supported interfaces are the
Electron desktop app (`apps/desktop-electron/`) and Python CLI (root `main.py` -> `src/main.py`).

The desktop path is React renderer -> `window.cuepoint` preload bridge -> Electron IPC/main ->
authenticated loopback HTTP/SSE -> `cuepoint.engine` -> Python services/core/data. Electron is
the only supported desktop UI; `src/gui_app.py` only launches it. Qt is optional compatibility
test material and must not enter core, engine, CLI, or services.

| Concern | Source |
| --- | --- |
| Matching/query/mix rules | `src/cuepoint/core/` |
| Rekordbox, Beatport, tags | `src/cuepoint/data/` |
| Orchestration | `src/cuepoint/services/` |
| Engine API/jobs | `src/cuepoint/engine/` |
| inCrate | `src/cuepoint/incrate/` |
| Shared models | `src/cuepoint/models/`, `src/cuepoint/compat/gui_types.py` |
| Electron main/preload | `apps/desktop-electron/electron/` |
| React UI | `apps/desktop-electron/renderer/src/` |
| Tests | `src/tests/`, `apps/desktop-electron/e2e/` |
| Build/release | `scripts/`, `.github/workflows/`, `build/` |

For intent, start with `docs/development/architecture.md`, accepted ADRs in
`docs/ui-overhaul/adr/`, or `docs/release/ops-index.md` as appropriate.

## Environment and commands

Python 3.11+ is supported (`.python-version` pins local development); desktop CI uses Node 22.
Run Python commands at repository root. Setup is documented in `README.md` and
`docs/development/developer-setup.md`.

```bash
# Run
python main.py --xml collection.xml --playlist "My Playlist"
cd apps/desktop-electron && npm run electron:start

# Focused/full Python validation
python -m pytest path/to/test_file.py -q
python scripts/run_tests.py --unit --no-slow
python scripts/run_tests.py --all --no-slow
ruff check src/
ruff format --check src/
mypy src/
python scripts/check_no_qt_in_core.py

# Renderer (from apps/desktop-electron/renderer)
npm test
npm run lint
npm run build:check

# Engine/desktop integration (from repository root unless command changes directory)
python -m pytest src/tests/unit/engine/ -q --tb=short
python scripts/smoke_engine_health.py
python scripts/check_desktop_version_coupling.py
cd apps/desktop-electron && npm run build
```

`scripts/run_tests.py` selects layers but does not accept arbitrary pytest options such as `-k`;
use `python -m pytest` for focused selectors. Run Electron E2E only when the changed flow warrants
it. Do not claim a check passed unless it ran; report skipped checks and why.

## Invariants

- For engine API changes, search and synchronize Python `server.py`/`*_api.py`, Electron
  `engineClient.ts`/`main.ts`, runtime `preload.cjs`, renderer bridge types/consumers, and tests.
  `preload.ts` is currently a placeholder, not the runtime preload.
- Bind the engine to loopback. Only `/health` is unauthenticated and it exposes no secrets;
  `/api/v1/*` uses the in-memory bearer token.
- Never expose tokens, unrestricted filesystem access, or Node APIs to renderer storage. Keep
  Electron context isolation and narrow preload methods.
- Preserve engine error envelopes, public CLI flags, API response shapes, output schemas, and
  config keys unless an explicitly requested breaking change includes migration documentation.
- Keep business rules in Python. Electron supervises/bridges; React presents state.
- Treat Rekordbox/audio files, tags, exports, history, logs, and caches as user data. Validate
  inputs and preserve non-destructive, backup, and audit behavior.
- Matching remains deterministic and reviewable: retain candidates, rejection reasons,
  confidence, and original display values. Mock external services in automated tests.
- Use existing renderer tokens, themes, and integer scale patterns; test pure UI logic.
- Keep `src/cuepoint/version.py` and desktop `package.json` engine version coupled.

## Change quality

- Make the smallest coherent change; search callers before deletion or rename.
- Keep shared skill instructions synchronized between `.agents/skills/` (Codex) and
  `.claude/skills/` (Claude Code); `agents/openai.yaml` metadata is Codex-only.
- Add unit tests for logic, a regression test for bugs, and integration/E2E coverage for changed
  boundaries. For regression tests see `src/tests/regression/README.md` (write it so it fails on
  the unfixed code first). Renderer component tests use Testing Library and live beside the
  component as `*.test.tsx`.
- Never commit secrets, signing material, personal paths, or unsanitized user data.
- Do not hand-edit `.venv/`, `node_modules/`, `build/`, `dist/`, `electron-dist/`, `release/`,
  coverage, caches, logs, or `output/`. Update tracked lockfiles only through intentional npm
  dependency commands.
- Update user docs for visible behavior, ADRs for architecture, and
  `docs/release/CHANGELOG.md` under `Unreleased` for notable changes.
- Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `build:`, `chore:`).
- Do not commit, tag, push, publish, sign, or release unless explicitly requested.

Before finishing, run `git diff --check` and inspect `git status --short`. Report the change,
checks actually run, and any remaining risk or manual verification.
