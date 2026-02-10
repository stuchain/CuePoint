# Keyboard Shortcuts and Themes

## What it is (high-level)

- **Keyboard shortcuts**: actions (Start, Cancel, Copy, Open file, Toggle progress, etc.) can be triggered by **keyboard shortcuts**. Shortcuts are **configurable** (e.g. a shortcuts dialog or customization dialog) and **persisted**. The app detects **conflicts** (same shortcut for two actions) and can warn or reassign. A **Help → Shortcuts** (or similar) page or dialog lists all shortcuts.
- **Themes**: the UI can use a **dark** (or light) theme: colors, fonts, and widget styles are defined in a central place (e.g. stylesheet or theme tokens). Theme may be selectable in settings or fixed per build.
- **Focus management**: tab order and focus are set so that keyboard users can navigate logically (e.g. collection → playlist → Start); optional **accessibility** helpers (e.g. high contrast, screen reader hints) may be in a dedicated module.

## How it is implemented (code)

- **Shortcut manager**  
  - **File:** `src/cuepoint/ui/widgets/shortcut_manager.py` — registers actions with default key sequences; loads/saves custom sequences (e.g. QSettings); applies shortcuts to QActions or widgets.  
  - **File:** `src/cuepoint/ui/main_window.py` — `setup_shortcuts()` creates QActions and connects them to methods (e.g. Start, Cancel, Copy, Open); uses shortcut_manager to assign keys. `on_shortcut_conflict(action_id1, action_id2)` is called when two actions share the same shortcut.

- **Shortcut customization**  
  - **File:** `src/cuepoint/ui/widgets/shortcut_customization_dialog.py` — dialog to change a shortcut for an action (key capture, conflict check).  
  - **File:** `src/cuepoint/ui/dialogs/shortcuts_dialog.py` — lists all actions and their shortcuts; may open customization or link to “How to see shortcuts” doc.

- **Special keys**  
  - **File:** `src/cuepoint/ui/main_window.py` — `_on_enter_start()` (Enter triggers Start when focus is on a “start” context), `_on_escape_cancel()` (Escape requests cancel when processing); `keyPressEvent()` may handle global shortcuts.

- **Themes and styles**  
  - **File:** `src/cuepoint/ui/widgets/theme.py` or `styles.py` — applies Qt stylesheet (e.g. `setStyleSheet(...)`) for main window and dialogs; defines colors for background, foreground, buttons, progress bar.  
  - **File:** `src/cuepoint/ui/widgets/theme_tokens.py` — constants (e.g. primary color, font size) used by theme and widgets.

- **Focus and accessibility**  
  - **File:** `src/cuepoint/ui/main_window.py` — `_setup_tab_order()`, `_setup_focus_management()` set tab order and focus policy.  
  - **File:** `src/cuepoint/ui/widgets/focus_manager.py` — optional helper for focus chains.  
  - **File:** `src/cuepoint/utils/accessibility.py` — optional helpers for role and name (e.g. for screen readers).

So: **what the feature is** = “configurable keyboard shortcuts with conflict detection and a shortcuts dialog; themed UI and focus/tab order”; **how it’s implemented** = shortcut_manager + shortcut_customization_dialog + shortcuts_dialog + main_window (setup_shortcuts, keyPressEvent) + theme/styles + theme_tokens + focus setup and optional accessibility.
