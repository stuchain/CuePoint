# Website skills (Phase 17)

Third-party Claude Code skills for building the website, vendored unmodified. Claude Code loads
them when a session first reads or edits a file under `apps/website/`, so they stay out of the
desktop-app work.

| Skills | Source | Commit | License |
|---|---|---|---|
| `impeccable` | https://github.com/pbakaus/impeccable (`.claude/skills/impeccable`) | bbcb29d (2026-10-06) | Apache-2.0 |
| `frontend-design` | https://github.com/anthropics/claude-plugins-official (`plugins/frontend-design`) | d4226d0 (2026-10-05) | Apache-2.0 |
| `threejs-*` (10) | https://github.com/CloudAI-X/threejs-skills | b1c6230 (2026-01-20) | MIT (stated in its README; no LICENSE file) |
| `gsap-*` (8) | https://github.com/greensock/gsap-skills (official GreenSock) | aed9cfd (2026-04-21) | MIT |
| `web-quality-audit`, `performance`, `core-web-vitals`, `accessibility`, `seo`, `best-practices` | https://github.com/addyosmani/web-quality-skills | afa8da9 (2026-08-24) | MIT |

License texts are in `licenses/`.

Notes:

- `impeccable` runs `scripts/impeccable`, a launcher that downloads the author's prebuilt binary from
  the project's GitHub releases on first use and checks its sha256 before running it. The skill's
  helper agents were not copied; it has fallbacks for running without them.
- Give `impeccable` the app's look as product context: `docs/v1/PIXEL_DESIGN_SYSTEM.md`.
- Claude SEO (https://github.com/AgriciDaniel/claude-seo) is a full plugin (Python CLI, hooks,
  agents) and cannot run from a vendored folder. Install it as a plugin in Claude Code instead:
  `/plugin marketplace add AgriciDaniel/claude-seo` then `/plugin install claude-seo@agricidaniel-claude-seo`.
- To update one, re-copy its folder from the source at a newer commit and update this table.
