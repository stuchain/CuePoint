# Phase 6 Implementation Quick Start Guide

This document provides a quick reference for implementing Phase 6. For detailed information, see the individual step documents.

## Prerequisites

1. **Complete Phase 5** (Code Restructuring) - Recommended
2. **Python 3.8+** with PySide6 installed
3. **Design Tools** (optional): Aseprite or Piskel for pixel art assets

## Implementation Order

**CRITICAL**: Follow steps in order. Each step depends on previous ones.

```
6.1 (Assets) → 6.2 (Theme) → 6.3 (Main Window) → 6.4 (Settings)
    ↓
6.5 (Results) → 6.6 (Tutorial) → 6.7 (Widgets) → 6.8 (Animations)
    ↓
6.9 (States) → 6.10 (Testing)
```

## Quick Implementation Checklist

### Step 6.1: Design System & Asset Creation (1 week)

**Files to Create**:
- `SRC/cuepoint/ui/theme/colors.py` - Color palette
- `SRC/cuepoint/ui/theme/assets/icon_registry.py` - Icon loader
- `SRC/cuepoint/ui/theme/assets/asset_catalog.py` - Asset catalog
- `SRC/cuepoint/ui/theme/__init__.py` - Package init
- `SRC/cuepoint/ui/theme/assets/__init__.py` - Assets init

**Directory Structure to Create**:
```bash
mkdir -p SRC/cuepoint/ui/theme/assets/{icons/{16x16,32x32},sprites/{characters,decorative},animations/{loading,progress},backgrounds}
```

**Key Implementation**:
1. Create `PixelColorPalette` class with all color definitions
2. Create `IconRegistry` class for icon loading/caching
3. Create `AssetCatalog` class for asset discovery
4. Create asset directories (icons will be added later)

**Test**: Run `pytest SRC/tests/unit/ui/theme/test_colors.py -v`

### Step 6.2: Implement Theme System (3-4 days)

**Files to Create**:
- `SRC/cuepoint/ui/theme/theme_manager.py` - Theme manager
- `SRC/cuepoint/ui/theme/pixel_theme.py` - Theme implementation

**Files to Modify**:
- `SRC/cuepoint/ui/main_window.py` - Add theme manager integration

**Key Implementation**:
1. Create `ThemeManager` class
2. Create `PixelTheme` class with QSS generation
3. Integrate `ThemeManager` into `MainWindow.__init__`
4. Add theme toggle to View menu

**Test**: Run `pytest SRC/tests/unit/ui/theme/test_theme_manager.py -v`

**Manual Test**: Run app, toggle theme, verify styling

### Step 6.3: Redesign Main Window - Simple Mode (4-5 days)

**Files to Create**:
- `SRC/cuepoint/ui/main_window_simple.py` - Simplified main window

**Files to Modify**:
- `SRC/cuepoint/ui/main_window.py` - Keep for advanced mode or refactor

**Key Implementation**:
1. Create `SimpleMainWindow` class
2. Implement step-by-step UI layout
3. Integrate with existing `GUIController`
4. Add tooltips to all elements
5. Implement file selection workflow
6. Implement process button workflow

**Integration Points**:
- Uses `ThemeManager` from Step 6.2
- Uses `GUIController` from existing code
- Uses `ResultsView` from existing code (will be enhanced in 6.5)

**Test**: Manual testing of complete workflow

### Step 6.4: Implement Advanced Settings Panel (3-4 days)

**Files to Create**:
- `SRC/cuepoint/ui/widgets/advanced_settings_panel.py`

**Files to Modify**:
- `SRC/cuepoint/ui/main_window_simple.py` - Integrate settings panel

**Key Implementation**:
1. Create `AdvancedSettingsPanel` class
2. Implement tabbed settings interface
3. Create setting widgets (check, combo, spin, text, path)
4. Integrate with `ConfigService`
5. Add search/filter functionality
6. Add reset to defaults

**Integration Points**:
- Uses `ConfigService` from existing code
- Uses `ThemeManager` for styling
- Connects to `SimpleMainWindow`

**Test**: Test all settings save/load correctly

### Step 6.5: Redesign Results View (3-4 days)

**Files to Create**:
- `SRC/cuepoint/ui/widgets/results_view_pixel.py`

**Files to Modify**:
- `SRC/cuepoint/ui/main_window_simple.py` - Use new results view

**Key Implementation**:
1. Create `ResultsViewPixel` class
2. Implement table view with status indicators
3. Implement card view
4. Add view mode switching
5. Add filtering and sorting
6. Integrate with `TrackResult` model

**Integration Points**:
- Uses `TrackResult` from existing models
- Uses `ThemeManager` for icons/colors
- Replaces or enhances existing `ResultsView`

**Test**: Test with various result sets

### Step 6.6: Create Onboarding & Tutorial System (4-5 days)

**Files to Create**:
- `SRC/cuepoint/ui/onboarding/tutorial_manager.py`
- `SRC/cuepoint/ui/onboarding/welcome_screen.py`
- `SRC/cuepoint/ui/onboarding/tooltip_manager.py`
- `SRC/cuepoint/ui/onboarding/__init__.py`

**Files to Modify**:
- `SRC/cuepoint/ui/main_window_simple.py` - Add tutorial integration

**Key Implementation**:
1. Create `TutorialManager` class
2. Create `WelcomeScreen` dialog
3. Create `TooltipManager` for contextual help
4. Integrate tutorial into main window
5. Add first-time user detection

**Test**: Test tutorial flow, verify persistence

### Step 6.7: Implement Custom Widgets & Components (5-6 days)

**Files to Create**:
- `SRC/cuepoint/ui/widgets/pixel_widgets.py` - All custom widgets

**Key Implementation**:
1. Create `PixelButton` widget
2. Create `PixelProgressBar` widget
3. Create `PixelCard` widget
4. Create `PixelBadge` widget
5. Create `PixelInput` widget (optional)
6. Create `PixelCheckbox` widget (optional)

**Integration**: Replace standard Qt widgets with pixel widgets throughout UI

**Test**: Test all widgets render and function correctly

### Step 6.8: Add Animations & Transitions (3-4 days)

**Files to Create**:
- `SRC/cuepoint/ui/animations/animation_utils.py`
- `SRC/cuepoint/ui/animations/transition_manager.py`
- `SRC/cuepoint/ui/animations/pixel_spinner.py`
- `SRC/cuepoint/ui/animations/__init__.py`

**Key Implementation**:
1. Create `AnimationUtils` class with fade/slide helpers
2. Create `TransitionManager` for view transitions
3. Create `PixelSpinner` for loading animations
4. Add animations to buttons and widgets
5. Add page transitions

**Test**: Verify 60fps performance, test all animations

### Step 6.9: Implement Empty States & Error States (2-3 days)

**Files to Create**:
- `SRC/cuepoint/ui/widgets/empty_state.py`
- `SRC/cuepoint/ui/widgets/error_state.py`

**Key Implementation**:
1. Create `EmptyStateWidget` class
2. Create `ErrorStateWidget` class
3. Integrate character sprites
4. Add helpful messages and actions
5. Integrate into main window and results view

**Test**: Test all empty/error states display correctly

### Step 6.10: User Testing & Refinement (1 week)

**Files to Create**:
- `SRC/cuepoint/ui/testing/feedback_collector.py`
- `SRC/cuepoint/ui/testing/test_scenarios.py`
- `SRC/cuepoint/ui/testing/__init__.py`

**Key Activities**:
1. Recruit test users (5-10 users)
2. Conduct usability testing
3. Collect and analyze feedback
4. Implement improvements
5. Re-test and iterate

**Deliverables**: Testing report, improvement list, refined UI

## Common Integration Points

### Existing Code to Use

1. **Controllers** (from existing code):
   - `GUIController` - Processing operations
   - `ResultsController` - Results management
   - `ExportController` - Export functionality
   - `ConfigController` - Configuration management

2. **Services** (from existing code):
   - `ConfigService` - Settings persistence
   - `ProcessorService` - Playlist processing
   - `BeatportService` - API interactions

3. **Models** (from existing code):
   - `TrackResult` - Result data model
   - `AppConfig` - Configuration model

### New Code Structure

```
SRC/cuepoint/ui/
├── theme/                    # NEW - Theme system
│   ├── theme_manager.py
│   ├── pixel_theme.py
│   ├── colors.py
│   └── assets/
├── widgets/                  # ENHANCED - New widgets
│   ├── pixel_widgets.py      # NEW
│   ├── advanced_settings_panel.py  # NEW
│   ├── results_view_pixel.py  # NEW
│   ├── empty_state.py        # NEW
│   └── error_state.py        # NEW
├── onboarding/               # NEW - Tutorial system
│   ├── tutorial_manager.py
│   ├── welcome_screen.py
│   └── tooltip_manager.py
├── animations/               # NEW - Animations
│   ├── animation_utils.py
│   └── transition_manager.py
└── main_window_simple.py     # NEW - Simplified window
```

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Test theme system
- Test widget rendering
- Test utility functions

### Integration Tests
- Test component interactions
- Test theme application
- Test workflow completion

### Manual Tests
- Test complete user workflows
- Test theme switching
- Test all UI interactions
- Test error handling

### User Tests
- Usability testing with real users
- Feedback collection
- Iterative refinement

## Common Issues & Solutions

### Issue: Theme not applying
**Solution**: Ensure `ThemeManager` is initialized before any UI widgets

### Issue: Icons not loading
**Solution**: Check asset paths, verify icons exist, check file permissions

### Issue: Performance problems
**Solution**: Enable icon caching, optimize QSS, reduce animation complexity

### Issue: Settings not persisting
**Solution**: Check `ConfigService` integration, verify QSettings path

## Next Steps After Phase 6

1. Gather user feedback
2. Refine based on testing
3. Consider additional features
4. Plan next phase

---

**Last Updated**: 2025-12-01  
**Status**: Implementation Guide

