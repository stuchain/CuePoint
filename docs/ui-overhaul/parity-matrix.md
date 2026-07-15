# GUI parity matrix (inKey + inCrate)

Maps **production Qt** surfaces to **Electron lab** routes for Phase 6 cutover. Update status as each row lands.

**Legend:** P0 = first milestone · P1 = before cutover · P2 = post-cutover polish

| Surface | Qt source | Lab route | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Tool picker | [`tool_selection_page.py`](../../src/cuepoint/ui/widgets/tool_selection_page.py) | `/` | P0 | Lab stub | Qt hides inCrate button; lab enables route stub |
| inKey main | [`main_window.py`](../../src/cuepoint/ui/main_window.py) (Main tab) | `/match` | P0 | Lab wired | Demo/real jobs via engine |
| inKey past searches | Main window tab | — | P1 | Not in lab | Add lab tab or route later |
| Results table | [`results_view.py`](../../src/cuepoint/ui/widgets/results_view.py) | `/results` | P0 | Wired | Engine results + export |
| Settings / export | [`settings_dialog.py`](../../src/cuepoint/ui/dialogs/settings_dialog.py) | `/settings` | P1 | Lab wired | Export via engine API |
| inCrate page shell | [`incrate_page.py`](../../src/cuepoint/ui/widgets/incrate_page.py) | `/incrate` | P1 | Lab stub | Tabbed sections in Qt |
| inCrate import | [`incrate_import_section.py`](../../src/cuepoint/ui/widgets/incrate_import_section.py) | `/incrate#import` | P1 | Lab stub | Collection XML import |
| inCrate inventory | [`incrate_inventory_section.py`](../../src/cuepoint/ui/widgets/incrate_inventory_section.py) | `/incrate` (panel) | P1 | Lab wired | Engine GET inventory + import |
| inCrate discover | [`incrate_discover_section.py`](../../src/cuepoint/ui/widgets/incrate_discover_section.py) | `/incrate#discover` | P1 | Lab stub | Charts / new releases |
| inCrate results | [`incrate_results_section.py`](../../src/cuepoint/ui/widgets/incrate_results_section.py) | `/incrate` (panel) | P1 | Not started | Discovery run results |
| inCrate playlist | [`incrate_playlist_section.py`](../../src/cuepoint/ui/widgets/incrate_playlist_section.py) | `/incrate#playlist` | P1 | Lab stub | Beatport playlist build |
| Batch results tabs | `results_view.py` batch mode | — | P1 | Not in lab | Multi-playlist tabs |
| Candidate / review dialogs | Qt dialogs | — | P1 | Not in lab | Phase 6 |
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
