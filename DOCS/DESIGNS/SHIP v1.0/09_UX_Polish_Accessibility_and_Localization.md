## 9. UX Polish, Accessibility & Localization (Ship v1.0)

### 9.1 Visual consistency
- Centralize theme tokens (colors, spacing, radius).
- Ensure:
  - consistent hover states
  - consistent control sizes
  - consistent typography

### 9.1.1 Theme token model (recommended)
Define a small set of tokens (single source of truth):
- Colors:
  - background, surface, border
  - primary/secondary/accent
  - success/warning/error
  - text primary/secondary
- Layout:
  - spacing: 4/6/8/10/12
  - radius: 6/8
  - control heights: input/button/table-row

Design goal: a user should *feel* consistency across all tabs and dialogs.

### 9.1.2 Interaction states
For all interactive controls define:
- default
- hover
- pressed
- focused (keyboard)
- disabled

Minimum acceptance criteria:
- focus is always visible
- hover is subtle (doesn’t “flash”)

### 9.2 Accessibility
- Keyboard navigation:
  - tab order correct
  - shortcuts discoverable (Help → Shortcuts)
- Screen readers:
  - accessible names/descriptions for core widgets
- Contrast:
  - verify key text meets minimum contrast thresholds

### 9.2.1 Keyboard specification
- Global:
  - `Ctrl/Cmd+O`: open XML
  - `Enter`: start (when enabled)
  - `Esc`: cancel (when processing)
  - `Ctrl/Cmd+E`: export
- Results view:
  - `Ctrl/Cmd+F`: focus search
  - `Ctrl/Cmd+Shift+F`: clear filters

### 9.2.2 Tab order specification (high-level)
- Main tab:
  - Collection path → Browse → Info
  - Mode radio group
  - Playlist dropdown
  - Start
  - Filters (search/status/confidence)
  - Results table
  - Export buttons

### 9.2.3 Screen reader requirements
- Every input has:
  - label association (buddy)
  - accessible name
  - accessible description
- Tables:
  - headers read correctly
  - selected row context is understandable

### 9.2.4 Contrast + sizing
- Ensure minimum contrast for:
  - body text
  - disabled text (still readable)
  - status colors (success/error)
- Minimum tap/target sizes:
  - 28px height for buttons/inputs (mac)

### 9.3 Localization readiness (v1.0)
- Don’t fully translate in v1.0 unless needed.
- Ensure UI strings are centralizable:
  - avoid hardcoding in many files
  - define a string table / translation hooks for later

### 9.3.1 Localization strategy
- Use Qt translation system (`QTranslator`) and `.ts/.qm` files.
- Centralize user-visible strings gradually:
  - start with top-level UI labels and dialogs
  - keep internal dev strings (debug) separate

### 9.3.2 Locale-sensitive formatting
- Dates/times in UI should respect locale.
- File naming should remain filesystem-safe (avoid colon on Windows).

### 9.4 Onboarding
- First-run:
  - explain “Collection XML”
  - link to export instructions
  - show a sample screenshot

### 9.4.1 Onboarding screens (recommended)
1) “Welcome to CuePoint”
2) “Select Collection XML” + link to instructions
3) “Choose mode” explanation (Single vs Batch)
4) “Results & export” overview

Persist:
- “don’t show again” checkbox

### 9.4.2 Empty states
Define clean empty states for:
- no XML selected
- no playlist selected
- no results yet
- no past searches found

### 9.5 Support UX
- “Report issue” action:
  - collects logs + version info
  - opens a GitHub issue template link
- “Open Output Folder”, “Open Logs Folder”

### 9.5.1 Support bundle UX
- “Help → Export Support Bundle…”
- Generates a zip with diagnostics + logs (see Runtime design)
- Optionally opens a pre-filled GitHub issue template:
  - version/build/SHA
  - OS
  - steps to reproduce

### 9.6 Professional polish extras (optional but recommended)
- “About” dialog:
  - version/build
  - links: docs, issues, privacy
- Changelog viewer:
  - shows recent release notes (from the same notes used by updater)
- Consistent icons:
  - app icon, in-app icons, menu icons


