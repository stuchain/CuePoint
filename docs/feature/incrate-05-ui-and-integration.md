# inCrate implementation design 05: UI and integration (Phase 5)

**Implementation order:** Phase 5 — build after Phases 1–4. Integrates all previous phases.  
**Spec:** [../incrate-spec.md](../incrate-spec.md)  
**Previous:** [incrate-04-playlist-and-auth.md](incrate-04-playlist-and-auth.md).

---

## 1. Goals and scope

1. Add **inCrate** as second tool on the **tool selection page** (next to inKey).
2. When inCrate is selected, show **inCrate interface:** Import XML, build/enrich inventory, Discover (charts + new releases), Review results, Add to playlist (run-specific name).
3. Expose **configuration** for: inventory DB path, Beatport API token, genres, playlist name format, optional browser credentials.
4. **Navigation:** Back to tool selection; optional "Switch to inKey".

**Out of scope:** Changes to inKey flow; only additive UI and wiring.

---

## 2. Exact file and directory layout

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `src/cuepoint/ui/widgets/tool_selection_page.py` | Add inCrate button; emit tool_selected("incrate"). |
| MODIFY | `src/cuepoint/ui/main_window.py` | In on_tool_selected, if tool_name == "incrate": show inCrate stack/widget. |
| CREATE | `src/cuepoint/ui/widgets/incrate_page.py` or `incrate/` under ui | Main inCrate widget: sections Import, Discover, Results, Playlist. |
| CREATE | `src/cuepoint/ui/widgets/incrate_import_section.py` | XML path, Import button, progress, stats (total tracks, artists, labels). |
| CREATE | `src/cuepoint/ui/widgets/incrate_discover_section.py` | Genre multi-select, Discover button, progress. |
| CREATE | `src/cuepoint/ui/widgets/incrate_results_section.py` | Table/list of DiscoveredTrack; optional remove row. |
| CREATE | `src/cuepoint/ui/widgets/incrate_playlist_section.py` | Playlist name edit, Add to playlist button, status/error. |
| MODIFY | Settings dialog | Add "inCrate" or "Beatport (inCrate)" section: inventory_db_path, beatport_access_token, playlist_name_format, genres (saved list), username/password optional. |

---

## 3. Tool selection page changes

**File:** `src/cuepoint/ui/widgets/tool_selection_page.py`

- Add second button after inKey: **inCrate**, same style as inKey (or distinct color). Subtitle: "Music digging" or "Charts & new releases".
- Connect click: `self.tool_selected.emit("incrate")`.
- get_selected_tool(): can remain "inkey" for default or return last selected; main_window uses the emitted value.

---

## 4. Main window routing

**File:** `src/cuepoint/ui/main_window.py`

- In `on_tool_selected(self, tool_name: str)`:
  - If tool_name == "inkey": existing behavior (show main interface, tabs).
  - Elif tool_name == "incrate": set central widget to inCrate page (create once or lazy); hide tabs; show inCrate widget. Optionally set menu items for "Back to tools" or "Switch to inKey".
- "Back to tools": call show_tool_selection_page() (existing method).
- Ensure inCrate page receives refs to InventoryService, BeatportApi, IncrateDiscoveryService, PlaylistWriter (from bootstrap/DI or main_window’s controller).

---

## 5. inCrate page layout (single scrollable screen)

**File:** `src/cuepoint/ui/widgets/incrate_page.py`

- **Layout:** QVBoxLayout or QFormLayout; sections stacked vertically:
  1. **Import section** (incrate_import_section): file path QLineEdit + Browse, Import button, progress QProgressBar or QLabel, stats QLabel (e.g. "N tracks, M artists, L labels").
  2. **Discover section** (incrate_discover_section): genre list QListWidget (multi-select) or checkboxes; "Charts: past month" / "New releases: last 30 days" labels; Discover button; progress.
  3. **Results section** (incrate_results_section): QTableWidget or QListView with columns (Title, Artists, Source); optional "Remove" per row; show count.
  4. **Playlist section** (incrate_playlist_section): QLineEdit playlist name (default from default_playlist_name("short")), Add to playlist button, QLabel status/error.
- **State:** Hold discovered_tracks: List[DiscoveredTrack] after Discover; pass to Playlist section for Add.
- **Threading:** Run import_from_xml and run_discovery in QThread or Worker to avoid blocking UI; emit progress and done signals; update UI in main thread.

---

## 6. Import section (detailed)

- **XML path:** QLineEdit (read-only or editable); Browse button opens QFileDialog for *.xml.
- **Import button:** On click: validate path exists; disable button; start worker: inventory_service.import_from_xml(path, enrich=True); on progress signal update QProgressBar or "Enriching N/M..."; on done: update stats (get_inventory_stats(), get_library_artists() count, get_library_labels() count); enable button; if errors show in status bar or QMessageBox.
- **First run:** If DB empty, after import show "Labels enriched for first import" or "Enriching labels... N/M".
- **Disable Discover until import done:** If get_inventory_stats()["total"] == 0, disable Discover button and show "Import Rekordbox XML first."

---

## 7. Discover section (detailed)

- **Genre list:** Populate from beatport_api.list_genres() on load (or when Import done); show genre name; user checks desired genres. Store selected genre ids.
- **Discover button:** On click: get selected genre ids; charts_from_date = today - 31 days; charts_to_date = today; run_discovery(inventory_service, beatport_api, genre_ids, charts_from_date, charts_to_date, new_releases_days=30, progress_callback=...); on progress update label "Discovering charts... N/M" or "Discovering releases..."; on done: set discovered_tracks; show in Results section; enable Add to playlist.
- **Empty result:** If result list empty, show "No charts or new releases found for this month; try other genres or check inventory."
- **No API token:** If token not configured, disable Discover and show "Configure Beatport API token in Settings."

---

## 8. Results section (detailed)

- **Table columns:** Title, Artists, Source (source_type + source_name), optional Remove button.
- **Data:** Set from discovered_tracks after Discover.
- **Remove:** Optional: remove row from list so user can exclude tracks before Add to playlist; update discovered_tracks in memory.
- **Count:** "N tracks" above or below table.

---

## 9. Playlist section (detailed)

- **Playlist name:** QLineEdit; default text = default_playlist_name(config "short" or "iso"). User can edit.
- **Add to playlist button:** On click: get name from QLineEdit; call create_playlist_and_add_tracks(name, discovered_tracks); on success show "Added N tracks to playlist [name]" and optional link (if playlist_url); on failure show error in QLabel or QMessageBox.
- **Progress:** If adding takes time (browser path), show "Adding to playlist... N/M".

---

## 10. Configuration UI

- In Settings dialog, add section **inCrate** (or under Beatport):
  - **Inventory DB path:** QLineEdit (default from config); optional Browse for directory or file.
  - **Beatport API token:** QLineEdit (password mode or plain); placeholder "Optional for discovery".
  - **Playlist name format:** QComboBox "Short (e.g. feb26)" | "ISO (e.g. 2025-02-26)".
  - **Genres:** Show list of genres from API; multi-select and save as config incrate.genres (list of ids).
  - **Beatport username / password:** Optional QLineEdit (password mode for password); for browser fallback.
- Save: write to config_service; apply when inCrate page loads.

---

## 11. Full testing design

### 11.1 UI tests – tool selection

**File:** `src/tests/ui/test_tool_selection_page.py` (extend)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_incrate_button_exists | Tool selection page has inCrate button | findChild or similar |
| test_incrate_button_emits_tool_selected | Click inCrate | tool_selected.emit("incrate") or signal received |

### 11.2 UI tests – main window

**File:** `src/tests/ui/test_main_window_incrate.py` (new)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_on_tool_selected_incrate_shows_incrate_page | on_tool_selected("incrate") | central widget is inCrate page |
| test_back_to_tools_shows_tool_selection | Trigger "Back to tools" | central widget is tool selection page |

### 11.3 UI tests – inCrate page (optional, with mocks)

| Test method | Description | Assertion |
|-------------|-------------|-----------|
| test_import_section_has_browse_and_import | inCrate page loaded | Import section has Browse, Import |
| test_discover_disabled_before_import | Before import | Discover button disabled |
| test_playlist_name_default | Load page | Playlist name edit has default "feb26" or today |

### 11.4 Full test matrix (Phase 5)

| # | Test file | Test method |
|---|-----------|-------------|
| 1 | test_tool_selection_page | test_incrate_button_exists |
| 2 | test_tool_selection_page | test_incrate_button_emits_tool_selected |
| 3 | test_main_window_incrate | test_on_tool_selected_incrate_shows_incrate_page |
| 4 | test_main_window_incrate | test_back_to_tools_shows_tool_selection |
| 5 | test_incrate_page | test_import_section_has_browse_and_import |
| 6 | test_incrate_page | test_discover_disabled_before_import |
| 7 | test_incrate_page | test_playlist_name_default |

### 11.5 File-by-file checklist (Phase 5)

| File | Item | Implemented | Test |
|------|------|-------------|------|
| tool_selection_page.py | inCrate button; emit "incrate" | [ ] | test_tool_selection_page |
| main_window.py | on_tool_selected("incrate") show inCrate | [ ] | test_main_window_incrate |
| incrate_page.py | Layout; Import/Discover/Results/Playlist sections | [ ] | test_incrate_page |
| incrate_import_section.py | Path, Browse, Import, progress, stats | [ ] | — |
| incrate_discover_section.py | Genres, Discover, progress | [ ] | — |
| incrate_results_section.py | Table, discovered_tracks | [ ] | — |
| incrate_playlist_section.py | Name edit, Add button, status | [ ] | — |
| Settings dialog | inCrate section | [ ] | — |

---

## 12. Error handling and empty states

- **No XML path:** Import button disabled or show "Select XML file first."
- **XML file not found:** After Import click, show "File not found."
- **No inventory (0 tracks):** "Import Rekordbox XML first."; Discover disabled.
- **No API token:** "Configure Beatport API token in Settings."; Discover disabled.
- **Discovery returned 0:** "No charts or new releases found; try other genres or check inventory."
- **Add to playlist failed:** Show error message from PlaylistResult.error.
- **No credentials for browser path:** "Add to playlist requires Beatport API or browser credentials."

---

## 13. Completion criteria

- [ ] inCrate button on tool selection; selecting inCrate shows inCrate page.
- [ ] Import, Discover, Results, Playlist sections implemented and wired to services.
- [ ] Config UI for inCrate/Beatport token and options.
- [ ] All Phase 5 UI tests pass; no regression in inKey.

---

## 14. End of inCrate implementation order

After Phase 5, inCrate is feature-complete per spec: inventory from Rekordbox, charts from library artists, new releases from labels, deduplicated list, add to playlist with per-run name, and full UI flow.

---

## Appendix A: Line-by-line implementation checklist (Phase 5)

1. **tool_selection_page.py:** Add QPushButton "inCrate"; set same style as inKey or distinct; connect clicked to lambda: self.tool_selected.emit("incrate"). Add subtitle QLabel "Music digging".
2. **main_window.py:** In on_tool_selected: if tool_name == "incrate": create IncratePage if not exists (inject services); setCentralWidget(incrate_page); optionally hide tabs. Add menu or button "Back to tools" -> show_tool_selection_page().
3. **incrate_page.py:** QWidget with QVBoxLayout. Add IncrateImportSection (path, Browse, Import, progress, stats). Add IncrateDiscoverSection (genre list from API, Discover button, progress). Add IncrateResultsSection (QTableWidget, columns Title/Artists/Source). Add IncratePlaylistSection (name QLineEdit default default_playlist_name("short"), Add button, status QLabel). Connect Import done -> update stats; enable Discover if total>0. Connect Discover done -> set discovered_tracks; fill Results table. Connect Add -> create_playlist_and_add_tracks(name, discovered_tracks); show result. Run import and discovery in QThread/Worker; emit progress and done.
4. **incrate_import_section.py:** QLineEdit path; QPushButton Browse (QFileDialog); QPushButton Import; QProgressBar or QLabel progress; QLabel stats. Import click: start worker inventory_service.import_from_xml(path, enrich); progress signal -> update progress label; done -> stats = get_inventory_stats(); set stats label; emit signal import_done for parent to enable Discover.
5. **incrate_discover_section.py:** QListWidget or checkboxes for genres (load from beatport_api.list_genres()). QPushButton Discover. Progress label. Discover click: get selected genre ids; run worker run_discovery(...); done -> emit discovered_tracks to parent.
6. **incrate_results_section.py:** set_tracks(tracks: List[DiscoveredTrack]); clear; for t in tracks: add row (t.title, t.artists, t.source_type + " " + t.source_name). get_tracks() for optional remove. Optional remove button per row.
7. **incrate_playlist_section.py:** QLineEdit name (setPlaceholderText or setText default_playlist_name). QPushButton Add to playlist. QLabel status. Add click: name = name_edit.text(); result = create_playlist_and_add_tracks(name, parent.discovered_tracks); if result.success: status.setText("Added %d tracks." % result.added_count); else: status.setText(result.error).
8. **Settings dialog:** Add "inCrate" section: inventory_db_path QLineEdit; beatport_access_token QLineEdit (password mode); playlist_name_format QComboBox; genres (load list_genres, multi-select, save ids); beatport_username, beatport_password QLineEdit. Save to config_service.

---

## Appendix B: Full test case specifications (Phase 5)

- **test_incrate_button_exists:** Instantiate ToolSelectionPage; findChild(QPushButton, "inCrate") or by text "inCrate"; assert is not None.
- **test_incrate_button_emits_tool_selected:** Connect tool_selected to slot; click inCrate button; assert slot received "incrate".
- **test_on_tool_selected_incrate_shows_incrate_page:** MainWindow; on_tool_selected("incrate"); assert centralWidget() is IncratePage or has class IncratePage.
- **test_back_to_tools_shows_tool_selection:** Show inCrate; trigger Back to tools; assert centralWidget() is ToolSelectionPage.
- **test_import_section_has_browse_and_import:** IncratePage; assert findChild for Browse and Import buttons.
- **test_discover_disabled_before_import:** IncratePage; assert discover_section.Discover button isEnabled() == False (or discover disabled when stats total 0).
- **test_playlist_name_default:** IncratePage; assert playlist_section name edit text or placeholder contains "feb" or today's month.

---

## Appendix C: Error and empty state matrix (Phase 5)

| UI state | Message / behavior |
|----------|---------------------|
| No XML path | "Select XML file first." or Import disabled |
| XML file not found | "File not found." after Import click |
| No inventory (0 tracks) | "Import Rekordbox XML first."; Discover disabled |
| No API token | "Configure Beatport API token in Settings."; Discover disabled |
| Discovery 0 tracks | "No charts or new releases found; try other genres or check inventory." |
| Add to playlist failed | Show PlaylistResult.error in status or QMessageBox |
| No browser credentials | "Add to playlist requires API or browser credentials." |

---

## Appendix D: Dependency graph (Phase 5)

```
ToolSelectionPage (inCrate button) -> emit "incrate"
MainWindow.on_tool_selected("incrate") -> setCentralWidget(IncratePage)
IncratePage
  -> IncrateImportSection -> InventoryService.import_from_xml, get_inventory_stats
  -> IncrateDiscoverSection -> BeatportApi.list_genres; IncrateDiscoveryService.run_discovery
  -> IncrateResultsSection <- discovered_tracks
  -> IncratePlaylistSection -> default_playlist_name; create_playlist_and_add_tracks(name, discovered_tracks)
Settings -> incrate.* config keys
```

---

## Appendix E: Exact function signatures and widget hierarchy (Phase 5)

**tool_selection_page.py**
- Add: `incrate_button = QPushButton("inCrate")`; `incrate_button.clicked.connect(lambda: self.tool_selected.emit("incrate"))`.

**main_window.py**
- `on_tool_selected(self, tool_name: str)`: add `elif tool_name == "incrate": self._show_incrate_page()`.
- `_show_incrate_page(self)`: if not self._incrate_page: self._incrate_page = IncratePage(services...); self.setCentralWidget(self._incrate_page).

**incrate_page.py**
- `class IncratePage(QWidget)`: __init__; add IncrateImportSection, IncrateDiscoverSection, IncrateResultsSection, IncratePlaylistSection; connect signals (import_done -> enable Discover; discovery_done -> set_tracks on results; add_clicked -> create_playlist_and_add_tracks).

**incrate_import_section.py**
- `class IncrateImportSection(QWidget)`: path_edit, browse_btn, import_btn, progress_label, stats_label; signal import_done; import_clicked starts Worker(import_from_xml).

**incrate_discover_section.py**
- `class IncrateDiscoverSection(QWidget)`: genre_list (from list_genres), discover_btn, progress_label; signal discovery_done(List[DiscoveredTrack]).

**incrate_results_section.py**
- `set_tracks(self, tracks: List[DiscoveredTrack])`; `get_tracks(self) -> List[DiscoveredTrack]`.

**incrate_playlist_section.py**
- name_edit, add_btn, status_label; add_clicked uses parent.get_tracks() and name_edit.text().

---

## Appendix F: Test file layout and pytest markers (Phase 5)

- `tests/ui/test_tool_selection_page.py`: add test_incrate_button_exists, test_incrate_button_emits_tool_selected.
- `tests/ui/test_main_window_incrate.py`: test_on_tool_selected_incrate_shows_incrate_page, test_back_to_tools_shows_tool_selection.
- `tests/ui/test_incrate_page.py`: test_import_section_has_browse_and_import, test_discover_disabled_before_import, test_playlist_name_default; use QTest or findChild.
