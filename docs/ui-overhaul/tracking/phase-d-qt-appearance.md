# Rollout Phase D — tracking

**Status:** Done — Qt Settings appearance

## Completed

- [x] `AppearanceSettingsWidget` in Settings dialog (top of scroll content)
- [x] Built-in themes: neoDark (default), retro16, qtEvolved, clubNeon, mutedPro
- [x] UI scale 1× / 2× / 3× (default 2×)
- [x] Custom theme CRUD with 8-color editor + derived borders/bevels
- [x] QSettings persistence + startup apply in `gui_app.py`
- [x] Live preview while Settings open; Cancel reverts unsaved appearance
- [x] Tests: `test_appearance_store.py`, `test_theme_derivation.py`, `test_appearance_manager.py`

## QSettings keys

| Key | Content |
| --- | --- |
| `appearance/theme` | Built-in id or `custom:{uuid}` |
| `appearance/uiScale` | 1, 2, or 3 |
| `appearance/customThemes` | JSON array of custom themes |

See [settings-and-appearance.md](../settings-and-appearance.md).
