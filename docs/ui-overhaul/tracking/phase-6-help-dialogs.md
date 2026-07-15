# Milestone — Phase 6 Help dialogs

**Status:** Done (local)

## Scope

| Qt surface | Electron |
| --- | --- |
| `shortcuts_dialog.py` | `ShortcutsDialog.tsx` + F1 / Ctrl+? |
| `privacy_dialog.py` | `PrivacyDialog.tsx` (prefs in localStorage) |
| `onboarding_dialog.py` | `OnboardingDialog.tsx` (first-run) |
| `dialogs.py` About | `AboutDialog.tsx` |
| `rekordbox_instructions_dialog.py` | `RekordboxInstructionsDialog.tsx` (Help menu) |

## Verification

- Help menu opens each dialog
- First launch shows onboarding until completed
- `npm test` — `keyboardShortcuts.test.ts`

## Remaining

- Wire privacy clear cache/logs to engine
- Full shortcut customization
- Playlist export instruction dialog (M3U)
