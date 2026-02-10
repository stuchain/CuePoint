# Main Window and Navigation

## What it is (high-level)

The **main window** is the primary GUI: it hosts the collection path, **mode** (single playlist vs batch), **playlist** selector, **Start Processing** button, and integrates menu bar, status bar, progress area, and results. It also handles:

- **File open / recent files**: browse for Rekordbox XML, recent files list (with clear), and **drag-and-drop** of the collection file onto the window.
- **Tool selection / onboarding**: on first run (or when no tool is selected), a **tool selection page** or **onboarding** can be shown; the main “CuePoint” flow leads to the main interface (collection + playlist + start).
- **New session / restart**: clear state and optionally reload file or playlist.
- **Export**: open export dialog (or export controller) to save results to CSV/Excel.
- **Settings**: open settings dialog.
- **State persistence**: window geometry and possibly last collection path and playlist name are **saved and restored** (e.g. QSettings) on exit/start.

## How it is implemented (code)

- **Main window class**  
  - **File:** `src/cuepoint/ui/main_window.py`  
  - **Class:** `MainWindow(QMainWindow)` — `init_ui()`, `create_menu_bar()`, `setup_connections()`, `setup_shortcuts()`, `save_state()`, `restore_state()`, `closeEvent()`.

- **Widgets**  
  - **File selector:** `src/cuepoint/ui/widgets/file_selector.py` — path input + “Browse…” for collection XML.  
  - **Playlist selector:** `src/cuepoint/ui/widgets/playlist_selector.py` — dropdown or list of playlist names (from `read_playlist_index` or parsed playlists).  
  - **Mode:** radio buttons or group for “Single” vs “Batch” (batch = multiple playlists); `on_mode_changed()` shows/hides playlist selector or batch list.  
  - **Tool selection:** `src/cuepoint/ui/widgets/tool_selection_page.py` — `show_tool_selection_page()`, `show_main_interface()`, `on_tool_selected()`.

- **File and recent**  
  - **File:** `src/cuepoint/ui/main_window.py`  
  - **Methods:** `on_file_open()`, `on_file_selected(file_path)`, `update_recent_files_menu()`, `on_open_recent_file(path)`, `save_recent_file(path)`, `clear_recent_files()`. Recent list is stored (e.g. QSettings or config) and shown in File menu.

- **Drag and drop**  
  - **File:** `src/cuepoint/ui/main_window.py`  
  - **Methods:** `dragEnterEvent()`, `dropEvent()` — accept drags that contain a single file (or URL); on drop, set collection path and optionally load playlists.

- **Menu bar**  
  - **File:** `src/cuepoint/ui/main_window.py` — `create_menu_bar()` — File (Open, Recent, Exit), Edit, View, Help (User guide, Onboarding, Shortcuts, Privacy, Terms, Licenses, Support policy, About, Changelog, Check for updates), and possibly Support (Log viewer, Export support bundle, Report issue, Diagnostics).

- **State**  
  - **File:** `src/cuepoint/ui/main_window.py` — `save_state()` writes geometry, collection path, playlist name, mode to QSettings; `restore_state()` reads them and restores playlist selection (with deferred selection if XML must be reloaded).

- **Controller**  
  - **File:** `src/cuepoint/ui/controllers/main_controller.py` (or GUIController) — coordinates MainWindow, processor_service, and progress/results; e.g. `start_processing()` is triggered from the main window and delegated to the controller.

So: **what the feature is** = “main window with file/playlist/mode, recent files, drag-drop, menu, and state restore”; **how it’s implemented** = `main_window.py` + file_selector, playlist_selector, tool_selection_page + main_controller + QSettings for state.
