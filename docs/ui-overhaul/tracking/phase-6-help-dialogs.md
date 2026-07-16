# Milestone — Phase 6 Help dialogs

**Status:** Done

## Scope

| Qt surface | Electron |
| --- | --- |
| `shortcuts_dialog.py` | `ShortcutsDialog.tsx` + F1 / Ctrl+? |
| `privacy_dialog.py` | `PrivacyDialog.tsx` (prefs in localStorage) |
| `onboarding_dialog.py` | `OnboardingDialog.tsx` (first-run) |
| `dialogs.py` About | `AboutDialog.tsx` |
| `rekordbox_instructions_dialog.py` | `RekordboxInstructionsDialog.tsx` (Help menu) |
| `playlist_export_instructions_dialog.py` | `PlaylistExportInstructionsDialog.tsx` (Help menu + inKey hint) |
| `log_viewer.py` | `LogViewerDialog.tsx` (Help menu) |

## Verification

- Help menu opens each dialog
- First launch shows onboarding until completed
- `npm test` — renderer unit tests (e.g. keyboard shortcuts)
- `pytest src/tests/unit/engine/test_engine_logs.py` — logs + clear endpoints

## Remaining

- Full shortcut customization
