## Goal

Shipping PySide6 app matches lab Results table column behavior.

## Tasks

- [ ] Per-column `minimumSectionSize` from lab `minWidthPx` map (Write 36, Index 48, …)
- [ ] Interactive column resize (replace `ResizeToContents`-only mode)
- [ ] Persist widths in `QSettings` (`results/columnWidths`)
- [ ] Double-click header handle resets column to default
- [ ] Regression test for Index min width

## Reference

- `src/cuepoint/ui/widgets/results_view.py`
- `apps/desktop-electron/renderer/src/mocks/resultsColumns.ts`
- [results-table.md](../results-table.md)

## Exit criteria

Index narrows below ~80px floor; widths restore after restart; existing Qt results tests pass.
