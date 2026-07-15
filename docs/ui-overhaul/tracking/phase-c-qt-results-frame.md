# Rollout Phase C — tracking

**Status:** Done

## Completed

- [x] `results_frame_layout.py` — clamp helpers + QSettings persistence
- [x] `ResultsFrameHost` — centered panel, 80vw max, resize grip
- [x] Wired in `results_view.py` (single + batch bottom stack)
- [x] Horizontal scroll on main tab when sized frame exceeds viewport
- [x] Tests: `test_results_frame_layout.py`

## Verify manually

1. Run Qt app, process a playlist, open results
2. Panel is centered; width ≤ 80% of window on wide monitors
3. Drag bottom-right grip — panel resizes; double-click resets
4. Size wider than window — main tab scrolls horizontally

See [rollout-phases.md](../rollout-phases.md).
