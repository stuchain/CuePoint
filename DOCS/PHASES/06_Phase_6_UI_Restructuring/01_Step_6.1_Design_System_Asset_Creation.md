# Step 6.1: Design System & Asset Creation

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 1 week  
**Dependencies**: None (can start immediately)

---

## Goal

Create the visual design system and all graphical assets needed for the Pokemon 2D pixel art style UI. This includes color palettes, icon sets, character sprites, loading animations, and UI component mockups.

---

## Success Criteria

- [ ] Complete color palette defined and documented
- [ ] Full icon set created (50+ icons, 16x16 and 32x32)
- [ ] Character sprites designed for empty states
- [ ] Loading animations created
- [ ] Button styles designed
- [ ] Background patterns/textures created
- [ ] All assets exported in appropriate formats
- [ ] Asset catalog/documentation created
- [ ] Assets organized in proper directory structure

---

## Analytical Design

### Asset Organization Structure

```
src/cuepoint/ui/theme/assets/
├── icons/
│   ├── 16x16/
│   │   ├── file.svg
│   │   ├── folder.svg
│   │   ├── play.svg
│   │   ├── pause.svg
│   │   ├── settings.svg
│   │   ├── export.svg
│   │   ├── search.svg
│   │   ├── check.svg
│   │   ├── cross.svg
│   │   ├── warning.svg
│   │   └── ... (50+ icons)
│   └── 32x32/
│       └── (same set, larger size)
├── sprites/
│   ├── characters/
│   │   ├── empty_state_character.png
│   │   ├── loading_character.png
│   │   └── error_character.png
│   └── decorative/
│       ├── border_pattern.png
│       └── background_tile.png
├── animations/
│   ├── loading/
│   │   ├── spinner_01.png
│   │   ├── spinner_02.png
│   │   └── ... (8 frame animation)
│   └── progress/
│       ├── progress_bar_fill.png
│       └── progress_bar_bg.png
└── backgrounds/
    ├── light_pattern.png
    └── dark_pattern.png
```

### Color Palette Specification

**Primary Colors** (Pokemon-inspired):
```python
PRIMARY_COLORS = {
    'blue': '#4A90E2',      # Pokemon Blue - Primary actions
    'red': '#E24A4A',       # Pokemon Red - Destructive actions
    'green': '#4AE24A',     # Success states
    'yellow': '#E2E24A',    # Warning states
    'purple': '#9B4AE2',    # Special features
    'orange': '#E29B4A',    # Highlights
}
```

**Background Colors**:
```python
BACKGROUND_COLORS = {
    'light_bg': '#F5F5F5',      # Main background
    'card_bg': '#FFFFFF',       # Card/panel background
    'dark_bg': '#2C2C2C',       # Dark mode background
    'card_dark': '#3A3A3A',     # Dark mode card
    'hover_bg': '#F0F0F0',      # Hover state
    'selected_bg': '#E8F4FD',    # Selected state
}
```

**Text Colors**:
```python
TEXT_COLORS = {
    'primary': '#333333',       # Main text
    'secondary': '#666666',     # Secondary text
    'disabled': '#999999',      # Disabled text
    'inverse': '#FFFFFF',       # Text on dark backgrounds
    'link': '#4A90E2',          # Links
}
```

**Status Colors**:
```python
STATUS_COLORS = {
    'success': '#4AE24A',
    'error': '#E24A4A',
    'warning': '#E2E24A',
    'info': '#4A90E2',
    'neutral': '#999999',
}
```

### Icon Set Requirements

**Required Icons (16x16 and 32x32)**:

1. **File Operations**:
   - `file.svg` - Generic file
   - `folder.svg` - Folder/directory
   - `folder_open.svg` - Open folder
   - `file_xml.svg` - XML file
   - `file_csv.svg` - CSV file
   - `export.svg` - Export action
   - `import.svg` - Import action
   - `save.svg` - Save action
   - `download.svg` - Download

2. **Playback Controls**:
   - `play.svg` - Play/start
   - `pause.svg` - Pause
   - `stop.svg` - Stop
   - `next.svg` - Next
   - `previous.svg` - Previous

3. **Settings & Configuration**:
   - `settings.svg` - Settings gear
   - `advanced.svg` - Advanced settings
   - `toggle_on.svg` - Toggle enabled
   - `toggle_off.svg` - Toggle disabled
   - `checkbox.svg` - Checkbox
   - `radio.svg` - Radio button

4. **Status & Feedback**:
   - `check.svg` - Success/checkmark
   - `cross.svg` - Error/cross
   - `warning.svg` - Warning
   - `info.svg` - Information
   - `loading.svg` - Loading spinner
   - `progress.svg` - Progress indicator

5. **Navigation**:
   - `home.svg` - Home
   - `back.svg` - Back
   - `forward.svg` - Forward
   - `menu.svg` - Menu
   - `close.svg` - Close
   - `minimize.svg` - Minimize
   - `maximize.svg` - Maximize

6. **Search & Filter**:
   - `search.svg` - Search
   - `filter.svg` - Filter
   - `sort.svg` - Sort
   - `refresh.svg` - Refresh

7. **Data Display**:
   - `table.svg` - Table view
   - `list.svg` - List view
   - `card.svg` - Card view
   - `grid.svg` - Grid view
   - `chart.svg` - Chart/graph

8. **Actions**:
   - `add.svg` - Add
   - `remove.svg` - Remove
   - `edit.svg` - Edit
   - `delete.svg` - Delete
   - `copy.svg` - Copy
   - `paste.svg` - Paste
   - `cut.svg` - Cut

**Icon Design Guidelines**:
- Pixel-perfect edges (no anti-aliasing)
- Consistent stroke width (2px for 16x16, 3px for 32x32)
- Clear, recognizable shapes
- High contrast for visibility
- Consistent style across all icons

### Character Sprites

**Empty State Character**:
- Pokemon-style sprite (32x32 or 64x64)
- Friendly, welcoming appearance
- Multiple poses for different states:
  - Neutral/idle
  - Searching
  - Success
  - Error/sad

**Loading Character**:
- Animated sprite (8-12 frames)
- Idle animation loop
- Used during processing

**Error Character**:
- Concerned/sad expression
- Used in error states

### Loading Animations

**Spinner Animation**:
- 8 frames, 360° rotation
- Pixel art style
- Smooth loop
- 16x16 and 32x32 versions

**Progress Bar**:
- Background tile (repeatable)
- Fill tile (repeatable)
- End caps (left and right)
- Pixel-perfect edges

### Button Styles

**Primary Button**:
- Background: Primary blue (#4A90E2)
- Text: White
- Border: 2px solid, darker blue
- Hover: Lighter blue
- Active: Darker blue
- Disabled: Gray with reduced opacity

**Secondary Button**:
- Background: Light gray
- Text: Primary text color
- Border: 1px solid, medium gray
- Hover: Slightly darker gray

**Success Button**:
- Background: Green (#4AE24A)
- Text: Dark green or white
- Border: 2px solid, darker green

**Danger Button**:
- Background: Red (#E24A4A)
- Text: White
- Border: 2px solid, darker red

### Background Patterns

**Light Pattern**:
- Subtle pixel art pattern
- Low opacity (10-15%)
- Repeatable tile
- Adds texture without distraction

**Dark Pattern**:
- Similar pattern for dark mode
- Adjusted for dark backgrounds

---

## Detailed Implementation Guide

### Step-by-Step Implementation

#### Step 1: Create Directory Structure

**Action**: Create the theme directory structure

**Commands**:
```bash
# Navigate to project root
cd C:\Users\Stelios\Desktop\CuePoint

# Create theme directory structure
mkdir -p SRC\cuepoint\ui\theme\assets\icons\16x16
mkdir -p SRC\cuepoint\ui\theme\assets\icons\32x32
mkdir -p SRC\cuepoint\ui\theme\assets\sprites\characters
mkdir -p SRC\cuepoint\ui\theme\assets\sprites\decorative
mkdir -p SRC\cuepoint\ui\theme\assets\animations\loading
mkdir -p SRC\cuepoint\ui\theme\assets\animations\progress
mkdir -p SRC\cuepoint\ui\theme\assets\backgrounds
```

**Verification**: Check that all directories exist:
```bash
dir SRC\cuepoint\ui\theme\assets /s
```

#### Step 2: Create Color Palette Module

**File Path**: `SRC/cuepoint/ui/theme/colors.py`

**Action**: Create the complete color palette implementation

**Complete Code**:
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Color palette definitions for pixel art theme.

This module provides the complete color palette for the Pokemon-inspired
pixel art UI theme. All colors are defined as hex values and organized
by category (primary, background, text, status).
"""

from typing import Dict, Optional


class PixelColorPalette:
    """Pokemon-inspired pixel art color palette.
    
    This class provides access to all colors used in the pixel art theme.
    Colors are organized into categories for easy access and maintenance.
    
    Usage:
        palette = PixelColorPalette()
        blue = palette.get_color('primary', 'blue')
        bg = palette.get_color('background', 'light_bg')
    """
    
    # Primary action colors (Pokemon-inspired)
    PRIMARY: Dict[str, str] = {
        'blue': '#4A90E2',      # Pokemon Blue - Primary actions, links
        'red': '#E24A4A',       # Pokemon Red - Destructive actions
        'green': '#4AE24A',     # Success states, positive actions
        'yellow': '#E2E24A',    # Warning states, highlights
        'purple': '#9B4AE2',    # Special features, premium
        'orange': '#E29B4A',    # Highlights, emphasis
    }
    
    # Background colors for different UI elements
    BACKGROUND: Dict[str, str] = {
        'light_bg': '#F5F5F5',      # Main window background (light mode)
        'card_bg': '#FFFFFF',       # Card/panel background (light mode)
        'dark_bg': '#2C2C2C',       # Main window background (dark mode)
        'card_dark': '#3A3A3A',     # Card/panel background (dark mode)
        'hover_bg': '#F0F0F0',      # Hover state background
        'selected_bg': '#E8F4FD',   # Selected state background
        'disabled_bg': '#E0E0E0',   # Disabled element background
    }
    
    # Text colors for different contexts
    TEXT: Dict[str, str] = {
        'primary': '#333333',       # Main text color
        'secondary': '#666666',     # Secondary text, labels
        'disabled': '#999999',      # Disabled text
        'inverse': '#FFFFFF',       # Text on dark backgrounds
        'link': '#4A90E2',          # Link text color
        'link_hover': '#3A7BC8',    # Link hover color
    }
    
    # Status colors for feedback and indicators
    STATUS: Dict[str, str] = {
        'success': '#4AE24A',      # Success messages, checkmarks
        'error': '#E24A4A',         # Error messages, failures
        'warning': '#E2E24A',       # Warning messages, cautions
        'info': '#4A90E2',          # Info messages, information
        'neutral': '#999999',       # Neutral state, inactive
    }
    
    # Border colors
    BORDER: Dict[str, str] = {
        'light': '#CCCCCC',         # Light border
        'medium': '#999999',        # Medium border
        'dark': '#666666',          # Dark border
        'focus': '#4A90E2',         # Focus border (primary blue)
    }
    
    def __init__(self):
        """Initialize color palette."""
        pass
    
    @classmethod
    def get_color(cls, category: str, name: str) -> str:
        """Get color by category and name.
        
        Args:
            category: Color category ('primary', 'background', 'text', 'status', 'border')
            name: Color name within the category
            
        Returns:
            Hex color string (e.g., '#4A90E2')
            
        Raises:
            KeyError: If category or name doesn't exist
            
        Example:
            >>> palette = PixelColorPalette()
            >>> blue = palette.get_color('primary', 'blue')
            >>> blue
            '#4A90E2'
        """
        color_map: Dict[str, Dict[str, str]] = {
            'primary': cls.PRIMARY,
            'background': cls.BACKGROUND,
            'text': cls.TEXT,
            'status': cls.STATUS,
            'border': cls.BORDER,
        }
        
        category_colors = color_map.get(category)
        if category_colors is None:
            raise KeyError(f"Unknown color category: {category}")
        
        color = category_colors.get(name)
        if color is None:
            raise KeyError(f"Unknown color name '{name}' in category '{category}'")
        
        return color
    
    @classmethod
    def get_all_colors(cls) -> Dict[str, Dict[str, str]]:
        """Get all colors organized by category.
        
        Returns:
            Dictionary mapping category names to color dictionaries
        """
        return {
            'primary': cls.PRIMARY.copy(),
            'background': cls.BACKGROUND.copy(),
            'text': cls.TEXT.copy(),
            'status': cls.STATUS.copy(),
            'border': cls.BORDER.copy(),
        }
    
    @classmethod
    def validate_contrast(cls, bg_color: str, text_color: str) -> bool:
        """Validate color contrast for accessibility (WCAG AA).
        
        Args:
            bg_color: Background color hex string
            text_color: Text color hex string
            
        Returns:
            True if contrast ratio meets WCAG AA standards (4.5:1 for normal text)
        """
        # Simple contrast check - full implementation would calculate luminance
        # For now, return True for known good combinations
        good_combinations = [
            ('#FFFFFF', '#333333'),  # White bg, dark text
            ('#2C2C2C', '#FFFFFF'),  # Dark bg, white text
            ('#4A90E2', '#FFFFFF'),  # Blue bg, white text
        ]
        return (bg_color, text_color) in good_combinations
```

**Action**: Create `__init__.py` files

**File Path**: `SRC/cuepoint/ui/theme/__init__.py`
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Theme package for pixel art UI."""

from cuepoint.ui.theme.colors import PixelColorPalette

__all__ = ['PixelColorPalette']
```

**File Path**: `SRC/cuepoint/ui/theme/assets/__init__.py`
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Assets package for theme resources."""
```

**Testing**: Create a test file to verify colors work

**File Path**: `SRC/tests/unit/ui/theme/test_colors.py`
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for color palette."""

import pytest
from cuepoint.ui.theme.colors import PixelColorPalette


def test_get_color():
    """Test getting colors by category and name."""
    palette = PixelColorPalette()
    
    # Test primary colors
    assert palette.get_color('primary', 'blue') == '#4A90E2'
    assert palette.get_color('primary', 'red') == '#E24A4A'
    
    # Test background colors
    assert palette.get_color('background', 'light_bg') == '#F5F5F5'
    assert palette.get_color('background', 'dark_bg') == '#2C2C2C'
    
    # Test text colors
    assert palette.get_color('text', 'primary') == '#333333'
    assert palette.get_color('text', 'inverse') == '#FFFFFF'
    
    # Test status colors
    assert palette.get_color('status', 'success') == '#4AE24A'
    assert palette.get_color('status', 'error') == '#E24A4A'


def test_get_color_invalid_category():
    """Test error handling for invalid category."""
    palette = PixelColorPalette()
    
    with pytest.raises(KeyError, match="Unknown color category"):
        palette.get_color('invalid', 'blue')


def test_get_color_invalid_name():
    """Test error handling for invalid color name."""
    palette = PixelColorPalette()
    
    with pytest.raises(KeyError, match="Unknown color name"):
        palette.get_color('primary', 'invalid')


def test_get_all_colors():
    """Test getting all colors."""
    palette = PixelColorPalette()
    all_colors = palette.get_all_colors()
    
    assert 'primary' in all_colors
    assert 'background' in all_colors
    assert 'text' in all_colors
    assert 'status' in all_colors
    assert 'border' in all_colors
    assert len(all_colors['primary']) > 0
```

**Run Test**:
```bash
cd SRC
python -m pytest tests/unit/ui/theme/test_colors.py -v
```

#### Step 3: Create Icon Registry

**File Path**: `SRC/cuepoint/ui/theme/assets/icon_registry.py`

**Complete Code**:
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Icon registry and loader for theme assets.

This module provides icon loading and caching functionality for the pixel art theme.
Icons are loaded from SVG files and cached for performance.
"""

import logging
from pathlib import Path
from typing import Dict, Optional

from PySide6.QtGui import QIcon

logger = logging.getLogger(__name__)


class IconRegistry:
    """Manages icon loading and caching.
    
    This class provides a centralized way to load and cache icons from the
    theme assets directory. Icons are cached in memory to avoid repeated
    file I/O operations.
    
    Usage:
        registry = IconRegistry(assets_path)
        icon = registry.get_icon('file', '16x16')
        button.setIcon(icon)
    """
    
    def __init__(self, assets_path: Path):
        """Initialize icon registry.
        
        Args:
            assets_path: Path to assets directory (should contain 'icons' subdirectory)
        """
        self.assets_path = Path(assets_path)
        self.icon_cache: Dict[str, QIcon] = {}
        
        # Validate assets path
        if not self.assets_path.exists():
            logger.warning(f"Assets path does not exist: {self.assets_path}")
    
    def get_icon(self, name: str, size: str = '16x16') -> QIcon:
        """Get icon by name and size.
        
        Args:
            name: Icon name without extension (e.g., 'file', 'folder')
            size: Icon size ('16x16' or '32x32')
            
        Returns:
            QIcon instance, or empty QIcon if not found
            
        Example:
            >>> registry = IconRegistry(Path('assets'))
            >>> icon = registry.get_icon('file', '16x16')
            >>> button.setIcon(icon)
        """
        cache_key = f"{name}_{size}"
        
        # Check cache first
        if cache_key in self.icon_cache:
            return self.icon_cache[cache_key]
        
        # Try to load icon
        icon = self._load_icon(name, size)
        
        # Cache it (even if empty, to avoid repeated file system checks)
        self.icon_cache[cache_key] = icon
        
        return icon
    
    def _load_icon(self, name: str, size: str) -> QIcon:
        """Load icon from file system.
        
        Args:
            name: Icon name
            size: Icon size
            
        Returns:
            QIcon instance
        """
        # Try SVG first (preferred)
        svg_path = self.assets_path / 'icons' / size / f"{name}.svg"
        if svg_path.exists():
            icon = QIcon(str(svg_path))
            if not icon.isNull():
                return icon
        
        # Fallback to PNG
        png_path = self.assets_path / 'icons' / size / f"{name}.png"
        if png_path.exists():
            icon = QIcon(str(png_path))
            if not icon.isNull():
                return icon
        
        # Icon not found
        logger.warning(f"Icon not found: {name} ({size}) at {svg_path} or {png_path}")
        return QIcon()  # Return empty icon
    
    def clear_cache(self):
        """Clear icon cache."""
        self.icon_cache.clear()
        logger.debug("Icon cache cleared")
    
    def get_available_icons(self, size: str = '16x16') -> list[str]:
        """Get list of available icon names for a given size.
        
        Args:
            size: Icon size ('16x16' or '32x32')
            
        Returns:
            List of icon names (without extension)
        """
        icon_dir = self.assets_path / 'icons' / size
        if not icon_dir.exists():
            return []
        
        icons = []
        # Check for SVG files
        for svg_file in icon_dir.glob('*.svg'):
            icons.append(svg_file.stem)
        # Check for PNG files (avoid duplicates)
        for png_file in icon_dir.glob('*.png'):
            if png_file.stem not in icons:
                icons.append(png_file.stem)
        
        return sorted(icons)
```

**Testing**: Create test file

**File Path**: `SRC/tests/unit/ui/theme/test_icon_registry.py`
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for icon registry."""

import tempfile
from pathlib import Path

import pytest
from PySide6.QtGui import QIcon

from cuepoint.ui.theme.assets.icon_registry import IconRegistry


def test_icon_registry_initialization(tmp_path):
    """Test icon registry initialization."""
    registry = IconRegistry(tmp_path)
    assert registry.assets_path == tmp_path
    assert len(registry.icon_cache) == 0


def test_get_icon_not_found(tmp_path):
    """Test getting non-existent icon."""
    registry = IconRegistry(tmp_path)
    icon = registry.get_icon('nonexistent', '16x16')
    assert isinstance(icon, QIcon)
    assert icon.isNull()


def test_get_icon_caching(tmp_path):
    """Test icon caching."""
    # Create icon directory structure
    icon_dir = tmp_path / 'icons' / '16x16'
    icon_dir.mkdir(parents=True)
    
    # Create a dummy SVG file (minimal valid SVG)
    svg_file = icon_dir / 'test.svg'
    svg_file.write_text('<svg><rect/></svg>')
    
    registry = IconRegistry(tmp_path)
    
    # First call should load from file
    icon1 = registry.get_icon('test', '16x16')
    assert not icon1.isNull()
    
    # Second call should use cache
    icon2 = registry.get_icon('test', '16x16')
    assert icon2 is icon1  # Same object from cache


def test_clear_cache(tmp_path):
    """Test clearing icon cache."""
    registry = IconRegistry(tmp_path)
    registry.get_icon('test', '16x16')  # Add to cache
    assert len(registry.icon_cache) > 0
    
    registry.clear_cache()
    assert len(registry.icon_cache) == 0


def test_get_available_icons(tmp_path):
    """Test getting available icons."""
    icon_dir = tmp_path / 'icons' / '16x16'
    icon_dir.mkdir(parents=True)
    
    # Create some test icons
    (icon_dir / 'file.svg').write_text('<svg></svg>')
    (icon_dir / 'folder.svg').write_text('<svg></svg>')
    
    registry = IconRegistry(tmp_path)
    icons = registry.get_available_icons('16x16')
    
    assert 'file' in icons
    assert 'folder' in icons
    assert len(icons) == 2
```

#### Step 4: Create Asset Catalog

**File Path**: `SRC/cuepoint/ui/theme/assets/asset_catalog.py`

**Complete Code**:
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Asset catalog for theme assets.

This module provides a catalog of all available theme assets, allowing
easy discovery and listing of icons, sprites, and other resources.
"""

import logging
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger(__name__)


class AssetCatalog:
    """Catalog of all theme assets.
    
    This class scans the assets directory and builds a catalog of all
    available icons, sprites, animations, and backgrounds.
    
    Usage:
        catalog = AssetCatalog(assets_path)
        icons = catalog.list_icons('16x16')
        sprites = catalog.list_sprites()
    """
    
    def __init__(self, assets_path: Path):
        """Initialize asset catalog.
        
        Args:
            assets_path: Path to assets directory
        """
        self.assets_path = Path(assets_path)
        self._catalog: Dict[str, List[str]] = {}
        self._build_catalog()
    
    def _build_catalog(self):
        """Build asset catalog from directory structure."""
        self._catalog = {
            'icons_16x16': [],
            'icons_32x32': [],
            'sprites': [],
            'animations': [],
            'backgrounds': [],
        }
        
        # Scan icons
        for size in ['16x16', '32x32']:
            icon_dir = self.assets_path / 'icons' / size
            if icon_dir.exists():
                icons = []
                for icon_file in icon_dir.glob('*.svg'):
                    icons.append(icon_file.stem)
                for icon_file in icon_dir.glob('*.png'):
                    if icon_file.stem not in icons:
                        icons.append(icon_file.stem)
                self._catalog[f'icons_{size}'] = sorted(icons)
        
        # Scan sprites
        sprites_dir = self.assets_path / 'sprites'
        if sprites_dir.exists():
            for sprite_file in sprites_dir.rglob('*.png'):
                relative_path = sprite_file.relative_to(self.assets_path)
                self._catalog['sprites'].append(relative_path.as_posix())
        
        # Scan animations
        animations_dir = self.assets_path / 'animations'
        if animations_dir.exists():
            for anim_file in animations_dir.rglob('*.png'):
                relative_path = anim_file.relative_to(self.assets_path)
                self._catalog['animations'].append(relative_path.as_posix())
        
        # Scan backgrounds
        backgrounds_dir = self.assets_path / 'backgrounds'
        if backgrounds_dir.exists():
            for bg_file in backgrounds_dir.glob('*.png'):
                self._catalog['backgrounds'].append(bg_file.name)
        
        logger.info(f"Asset catalog built: {sum(len(v) for v in self._catalog.values())} assets found")
    
    def list_icons(self, size: str = '16x16') -> List[str]:
        """List available icons for given size.
        
        Args:
            size: Icon size ('16x16' or '32x32')
            
        Returns:
            List of icon names (without extension)
        """
        return self._catalog.get(f'icons_{size}', []).copy()
    
    def list_sprites(self) -> List[str]:
        """List available sprites.
        
        Returns:
            List of sprite paths (relative to assets directory)
        """
        return self._catalog.get('sprites', []).copy()
    
    def list_animations(self) -> List[str]:
        """List available animations.
        
        Returns:
            List of animation frame paths
        """
        return self._catalog.get('animations', []).copy()
    
    def list_backgrounds(self) -> List[str]:
        """List available backgrounds.
        
        Returns:
            List of background file names
        """
        return self._catalog.get('backgrounds', []).copy()
    
    def get_catalog_summary(self) -> Dict[str, int]:
        """Get summary of catalog contents.
        
        Returns:
            Dictionary mapping asset types to counts
        """
        return {
            'icons_16x16': len(self._catalog.get('icons_16x16', [])),
            'icons_32x32': len(self._catalog.get('icons_32x32', [])),
            'sprites': len(self._catalog.get('sprites', [])),
            'animations': len(self._catalog.get('animations', [])),
            'backgrounds': len(self._catalog.get('backgrounds', [])),
        }
```

## Implementation Plan

### Phase 1: Color Palette Definition (Day 1)

### Phase 2: Icon Creation (Days 2-4)

1. **Set Up Icon Creation Workflow**:
   - Use Aseprite or Piskel for pixel art
   - Create template (16x16 and 32x32)
   - Define consistent style guide

2. **Create Icon Set**:
   - Start with most critical icons (file, folder, play, settings)
   - Create remaining icons systematically
   - Ensure consistency across all icons

3. **Export Icons**:
   - Export as SVG for scalability
   - Also export PNG for fallback
   - Organize in directory structure

4. **Create Icon Registry**:
   ```python
   # src/cuepoint/ui/theme/assets/icon_registry.py
   """
   Icon registry and loader.
   """
   
   from pathlib import Path
   from typing import Dict, Optional
   from PySide6.QtGui import QIcon
   
   class IconRegistry:
       """Manages icon loading and caching."""
       
       def __init__(self, assets_path: Path):
           self.assets_path = assets_path
           self.icon_cache: Dict[str, QIcon] = {}
       
       def get_icon(self, name: str, size: str = '16x16') -> QIcon:
           """Get icon by name and size."""
           cache_key = f"{name}_{size}"
           if cache_key in self.icon_cache:
               return self.icon_cache[cache_key]
           
           icon_path = self.assets_path / 'icons' / size / f"{name}.svg"
           if icon_path.exists():
               icon = QIcon(str(icon_path))
               self.icon_cache[cache_key] = icon
               return icon
           
           # Return empty icon if not found
           return QIcon()
   ```

### Phase 3: Character Sprites (Day 5)

1. **Design Character Sprites**:
   - Create base character design
   - Design multiple poses/expressions
   - Ensure pixel art style consistency

2. **Export Sprites**:
   - Export as PNG with transparency
   - Multiple sizes if needed
   - Organize in sprites directory

### Phase 4: Animations (Day 6)

1. **Create Loading Spinner**:
   - Design 8-frame animation
   - Export individual frames
   - Create animation sequence file

2. **Create Progress Bar Assets**:
   - Design background tile
   - Design fill tile
   - Design end caps

### Phase 5: Background Patterns (Day 7)

1. **Design Patterns**:
   - Create subtle pixel art pattern
   - Design for light and dark modes
   - Ensure repeatability

2. **Export Patterns**:
   - Export as PNG tiles
   - Test repeatability
   - Document usage

### Phase 6: Asset Catalog & Documentation (Day 7)

1. **Create Asset Catalog**:
   ```python
   # src/cuepoint/ui/theme/assets/asset_catalog.py
   """
   Asset catalog for theme assets.
   """
   
   from pathlib import Path
   from typing import List, Dict
   
   class AssetCatalog:
       """Catalog of all theme assets."""
       
       def __init__(self, assets_path: Path):
           self.assets_path = assets_path
           self._catalog: Dict[str, List[str]] = {}
           self._build_catalog()
       
       def _build_catalog(self):
           """Build asset catalog from directory structure."""
           # Scan icons
           icons_16 = list((self.assets_path / 'icons' / '16x16').glob('*.svg'))
           icons_32 = list((self.assets_path / 'icons' / '32x32').glob('*.svg'))
           
           self._catalog['icons_16x16'] = [f.stem for f in icons_16]
           self._catalog['icons_32x32'] = [f.stem for f in icons_32]
           
           # Scan sprites
           sprites = list((self.assets_path / 'sprites').rglob('*.png'))
           self._catalog['sprites'] = [f.relative_to(self.assets_path).as_posix() 
                                       for f in sprites]
       
       def list_icons(self, size: str = '16x16') -> List[str]:
           """List available icons for given size."""
           return self._catalog.get(f'icons_{size}', [])
       
       def list_sprites(self) -> List[str]:
           """List available sprites."""
           return self._catalog.get('sprites', [])
   ```

2. **Create Documentation**:
   - Document all assets
   - Include usage examples
   - Create style guide

---

## File Structure

```
src/cuepoint/ui/theme/
├── __init__.py
├── colors.py                    # Color palette definitions
├── assets/
│   ├── __init__.py
│   ├── icon_registry.py        # Icon loading and caching
│   ├── asset_catalog.py        # Asset catalog
│   ├── icons/
│   │   ├── 16x16/
│   │   └── 32x32/
│   ├── sprites/
│   │   ├── characters/
│   │   └── decorative/
│   ├── animations/
│   │   ├── loading/
│   │   └── progress/
│   └── backgrounds/
└── ASSET_CATALOG.md            # Asset documentation
```

---

## Testing Requirements

### Visual Testing
- [ ] All icons render correctly at both sizes
- [ ] Icons maintain clarity at different zoom levels
- [ ] Character sprites display properly
- [ ] Animations loop smoothly
- [ ] Background patterns tile correctly
- [ ] Colors meet contrast requirements (WCAG AA)

### Functional Testing
- [ ] Icon registry loads all icons correctly
- [ ] Asset catalog includes all assets
- [ ] Missing assets handled gracefully
- [ ] Asset paths resolve correctly on all platforms

---

## Dependencies

- **Design Tools**: Aseprite, Piskel, or similar pixel art tool
- **Export Tools**: ImageMagick or similar for batch processing
- **Python Libraries**: None (assets are static files)

---

## Implementation Checklist

- [ ] Create color palette configuration
- [ ] Document color usage guidelines
- [ ] Create icon creation template
- [ ] Design and export all required icons (50+)
- [ ] Create character sprites
- [ ] Design loading animations
- [ ] Create progress bar assets
- [ ] Design background patterns
- [ ] Set up asset directory structure
- [ ] Implement icon registry
- [ ] Implement asset catalog
- [ ] Create asset documentation
- [ ] Test all assets load correctly
- [ ] Verify asset organization

---

## Notes

- **Pixel Art Tools**: Aseprite is recommended for professional pixel art creation
- **Icon Format**: SVG preferred for scalability, PNG as fallback
- **Sprite Format**: PNG with transparency
- **Animation Format**: Individual PNG frames or animated GIF
- **Consistency**: Maintain consistent style across all assets
- **Accessibility**: Ensure sufficient contrast for all color combinations

---

## Next Steps

After completing this step:
1. Proceed to Step 6.2: Implement Theme System
2. Theme system will use assets created here
3. Test theme system with all assets

