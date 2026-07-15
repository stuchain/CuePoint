# Pixel UI assets (reference)

This folder holds **documentation** for pixel-art assets used by the future Electron UI. **Source files** (e.g. Aseprite) should stay **out of git** per [phase-0c-repo-hygiene.md](../phase-0c-repo-hygiene.md); commit **exported** PNG/WebP and **JSON** 9-slice metadata only.

## Export checklist

1. Export at **1×** pixel density unless a separate HDPI pass is explicitly defined.
2. Use **PNG-8/PNG-24** as appropriate; avoid accidental **gamma** shifts.
3. For **9-slice** panels, record insets in a small JSON file next to the image, e.g. `{ "left": 8, "right": 8, "top": 8, "bottom": 8 }`.
4. Name files predictably: `button-primary-idle.png`, `panel-section.png`, etc.

See [phase-1-pixel-design-system.md](../phase-1-pixel-design-system.md) for the full pipeline.

## Analytical acceptance (assets)

| Check | Method |
|-------|--------|
| No accidental upscale blur | Open PNG at 100% and 200% integer zoom |
| 9-slice insets correct | Resize mock in engine; corners **unchanged** |
| File size within budget | Compare total atlas bytes vs Phase 1 budget |
| License | `LICENSE` or `OFL.txt` adjacent to font binaries |
