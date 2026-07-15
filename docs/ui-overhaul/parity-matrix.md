# GUI parity matrix (inKey + inCrate)

Maps **production Qt** surfaces to **Electron lab** routes for Phase 6 cutover. Update status as each row lands.

**Legend:** P0 = first milestone · P1 = before cutover · P2 = post-cutover polish

| Surface | Qt source | Lab route | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Tool picker | [`tool_selection_page.py`](../../src/cuepoint/ui/widgets/tool_selection_page.py) | `/` | P0 | Lab wired | Centered landing + inKey primary CTA |
| inKey main | [`main_window.py`](../../src/cuepoint/ui/main_window.py) (Main tab) | `/match` | P0 | Lab wired | XML/M3U jobs + drag-drop |
| inKey past searches | Main window tab | `/match` (Past searches tab) | P1 | Lab wired | History + XML/M3U re-run + tag sync |
| Results table | [`results_view.py`](../../src/cuepoint/ui/widgets/results_view.py) | `/results` | P0 | Wired | Engine results + export + tag sync |
| Settings / export | [`settings_dialog.py`](../../src/cuepoint/ui/dialogs/settings_dialog.py) | `/settings` | P1 | Lab wired | Export + Beatport token via engine |
| inCrate page shell | [`incrate_page.py`](../../src/cuepoint/ui/widgets/incrate_page.py) | `/incrate` | P1 | Lab wired | Import, discover, playlist via engine |
| inCrate import | [`incrate_import_section.py`](../../src/cuepoint/ui/widgets/incrate_import_section.py) | `/incrate#import` | P1 | Lab wired | Browse, enrich, reset, stats |
| inCrate inventory | [`incrate_inventory_section.py`](../../src/cuepoint/ui/widgets/incrate_inventory_section.py) | `/incrate` (panel) | P1 | Lab wired | Engine GET inventory + import |
| inCrate discover | [`incrate_discover_section.py`](../../src/cuepoint/ui/widgets/incrate_discover_section.py) | `/incrate#discover` | P1 | Lab wired | Engine discover API |
| inCrate results | [`incrate_results_section.py`](../../src/cuepoint/ui/widgets/incrate_results_section.py) | `/incrate` (panel) | P1 | Lab wired | Discovery results list |
| inCrate playlist | [`incrate_playlist_section.py`](../../src/cuepoint/ui/widgets/incrate_playlist_section.py) | `/incrate#playlist` | P1 | Lab wired | Engine playlist API |
| Batch results tabs | `results_view.py` batch mode | `/results` (batch mode) | P1 | Lab wired | Demo batch job + playlist tabs |
| Candidate / review dialogs | Qt dialogs | `/results` | P1 | Lab wired | Candidate dialog + Needs review filter |
| Onboarding / updates | Qt | — | P2 | Not in lab | Phase 6+ |

## Column index parity (Results)

Both stacks use indices 0–13 aligned with [`resultsColumns.ts`](../../apps/desktop-electron/renderer/src/mocks/resultsColumns.ts) and `results_view.py` `COL_*`.

## Milestone 1 scope

| Workstream | Rows touched |
| --- | --- |
| Qt Rollout Phase B | Results table |
| Spike S1 | (none — infrastructure) |
| Lab `/incrate` stub | inCrate shell + import/discover/playlist panels (mock) |

## Next milestone (gate)

- Rollout Phase A: Settings scroll in Qt
- Phase 3 API: progress, results, inCrate inventory endpoints
- Lab: wire `/match` and `/incrate` to engine when API exists

See [tracking/README.md](tracking/README.md).
