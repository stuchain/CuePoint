# Step 6.1: Establish Project Structure

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: None (can start immediately)

---

## Goal

Create the new professional directory structure and systematically move existing files to appropriate locations while updating all import statements to maintain functionality.

---

## Success Criteria

- [ ] New directory structure created
- [ ] All existing files moved to appropriate locations
- [ ] All import statements updated correctly
- [ ] Application runs without import errors
- [ ] Build/package configuration updated
- [ ] Documentation paths updated
- [ ] All functionality preserved

---

## Current vs. Target Structure

### Current Structure (Assumed)
```
CuePoint/
├── SRC/
│   ├── gui/
│   │   ├── main_window.py
│   │   ├── results_view.py
│   │   ├── config_panel.py
│   │   └── ...
│   ├── processor.py
│   ├── matcher.py
│   ├── parser.py
│   ├── beatport.py
│   ├── cache.py
│   └── ...
├── DOCS/
└── ...
```

### Target Structure
```
CuePoint/
├── src/
│   ├── cuepoint/
│   │   ├── __init__.py
│   │   ├── core/                    # Core business logic
│   │   │   ├── __init__.py
│   │   │   ├── matcher.py
│   │   │   ├── parser.py
│   │   │   ├── query_generator.py
│   │   │   └── text_processing.py
│   │   ├── data/                     # Data access layer
│   │   │   ├── __init__.py
│   │   │   ├── beatport.py
│   │   │   ├── cache.py
│   │   │   └── storage.py
│   │   ├── ui/                       # User interface
│   │   │   ├── __init__.py
│   │   │   ├── main_window.py
│   │   │   ├── widgets/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── progress_widget.py
│   │   │   │   ├── results_view.py
│   │   │   │   └── ...
│   │   │   ├── dialogs/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── export_dialog.py
│   │   │   │   └── ...
│   │   │   └── controllers/
│   │   │       ├── __init__.py
│   │   │       └── main_controller.py
│   │   ├── services/                 # Application services
│   │   │   ├── __init__.py
│   │   │   ├── processor.py
│   │   │   ├── export_service.py
│   │   │   └── config_service.py
│   │   ├── models/                    # Data models
│   │   │   ├── __init__.py
│   │   │   ├── track.py
│   │   │   ├── result.py
│   │   │   └── config.py
│   │   ├── utils/                     # Utility functions
│   │   │   ├── __init__.py
│   │   │   ├── logging.py
│   │   │   ├── errors.py
│   │   │   └── validators.py
│   │   └── exceptions/                # Custom exceptions
│   │       ├── __init__.py
│   │       └── cuepoint_exceptions.py
│   ├── tests/                         # Test suite
│   │   ├── __init__.py
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── ui/
│   │   └── fixtures/
│   ├── main.py
│   └── gui_app.py
```

---

## Implementation Plan

### Phase 1: Create Directory Structure (1-2 hours)

1. **Create Main Package Structure**
   ```bash
   mkdir -p src/cuepoint/{core,data,ui,services,models,utils,exceptions}
   mkdir -p src/cuepoint/ui/{widgets,dialogs,controllers}
   mkdir -p src/tests/{unit,integration,ui,fixtures}
   ```

2. **Create All `__init__.py` Files**
   - Create empty `__init__.py` files in all package directories
   - These files make Python treat directories as packages

3. **Create Entry Point Files**
   - `src/main.py` - CLI entry point (if needed)
   - `src/gui_app.py` - GUI application entry point

### Phase 2: File Mapping and Migration (4-6 hours)

#### Core Module Mapping
- `SRC/matcher.py` → `src/cuepoint/core/matcher.py`
- `SRC/parser.py` → `src/cuepoint/core/parser.py`
- `SRC/query_generator.py` → `src/cuepoint/core/query_generator.py` (if exists)
- `SRC/text_processing.py` → `src/cuepoint/core/text_processing.py` (if exists)

#### Data Module Mapping
- `SRC/beatport.py` → `src/cuepoint/data/beatport.py`
- `SRC/cache.py` → `src/cuepoint/data/cache.py`
- Create `src/cuepoint/data/storage.py` if needed for file operations

#### UI Module Mapping
- `SRC/gui/main_window.py` → `src/cuepoint/ui/main_window.py`
- `SRC/gui/results_view.py` → `src/cuepoint/ui/widgets/results_view.py`
- `SRC/gui/progress_widget.py` → `src/cuepoint/ui/widgets/progress_widget.py` (if exists)
- `SRC/gui/config_panel.py` → `src/cuepoint/ui/widgets/config_panel.py` (if exists)
- `SRC/gui/export_dialog.py` → `src/cuepoint/ui/dialogs/export_dialog.py` (if exists)
- `SRC/gui/dialogs.py` → Split into individual files in `src/cuepoint/ui/dialogs/`
- `SRC/gui/controller.py` or `SRC/gui/gui_controller.py` → `src/cuepoint/ui/controllers/main_controller.py`

#### Services Module Mapping
- `SRC/processor.py` → `src/cuepoint/services/processor.py`
- Create `src/cuepoint/services/export_service.py` (extract from UI)
- Create `src/cuepoint/services/config_service.py` (extract from UI)

#### Models Module
- Create `src/cuepoint/models/track.py` (if track data structures exist)
- Create `src/cuepoint/models/result.py` (if result data structures exist)
- `SRC/config.py` → `src/cuepoint/models/config.py` (if it's a data model)

#### Utils Module
- Create `src/cuepoint/utils/logging.py` (logging utilities)
- Create `src/cuepoint/utils/errors.py` (error handling utilities)
- Create `src/cuepoint/utils/validators.py` (input validation utilities)

#### Exceptions Module
- Create `src/cuepoint/exceptions/cuepoint_exceptions.py` (custom exceptions)

### Phase 3: Update Import Statements (6-8 hours)

#### Import Update Strategy

1. **Identify All Import Statements**
   - Search for all `import` and `from` statements
   - Document current import patterns

2. **Update Internal Imports**
   - Change relative imports to absolute imports using package structure
   - Example: `from matcher import ...` → `from cuepoint.core.matcher import ...`
   - Example: `from gui.main_window import ...` → `from cuepoint.ui.main_window import ...`

3. **Update Entry Point Imports**
   - Update `main.py` and `gui_app.py` to use new package structure
   - Ensure application can start correctly

4. **Update Test Imports**
   - Move existing tests to appropriate test directories
   - Update test imports to use new package structure

### Phase 4: Update Build Configuration (2-3 hours)

1. **Update `setup.py` or `pyproject.toml`**
   ```python
   # setup.py example
   from setuptools import setup, find_packages
   
   setup(
       name="cuepoint",
       version="1.0.0",
       packages=find_packages(where="src"),
       package_dir={"": "src"},
       # ... other configuration
   )
   ```

2. **Update `requirements.txt`**
   - Ensure all dependencies are listed
   - Organize into `requirements.txt` and `requirements-dev.txt`

3. **Update Path References**
   - Update any scripts that reference old paths
   - Update documentation paths

---

## Detailed Implementation Steps

### Step 1: Create Directory Structure

**Files to Create:**
- All package directories with `__init__.py` files
- Entry point files (`main.py`, `gui_app.py`)

**Implementation:**
```python
# Create __init__.py files with package-level documentation
# src/cuepoint/__init__.py
"""
CuePoint - Beatport Metadata Enricher
Main package for the CuePoint application.
"""

__version__ = "1.0.0"

# src/cuepoint/core/__init__.py
"""
Core business logic modules.
Contains matching algorithms, parsing, and text processing.
"""

# src/cuepoint/data/__init__.py
"""
Data access layer.
Contains Beatport API client, caching, and storage.
"""

# Similar for other packages...
```

### Step 2: Move Files Systematically

**Approach:**
1. Move one module at a time
2. Update imports in that module first
3. Update all files that import from that module
4. Test that imports work
5. Move to next module

**Example Migration:**
```python
# Before: SRC/matcher.py
def best_beatport_match(track, candidates):
    # ... implementation

# After: src/cuepoint/core/matcher.py
# Update any imports within the file
from cuepoint.core.text_processing import normalize_text
# ... rest of implementation
```

### Step 3: Update Import Statements

**Pattern Matching:**
- `from matcher import ...` → `from cuepoint.core.matcher import ...`
- `from processor import ...` → `from cuepoint.services.processor import ...`
- `from gui.main_window import ...` → `from cuepoint.ui.main_window import ...`
- `from beatport import ...` → `from cuepoint.data.beatport import ...`

**Import Update Script:**
```python
# Create a script to help update imports
# update_imports.py (temporary helper script)

import re
import os

IMPORT_MAPPINGS = {
    r'^from matcher import': 'from cuepoint.core.matcher import',
    r'^import matcher': 'import cuepoint.core.matcher',
    r'^from processor import': 'from cuepoint.services.processor import',
    # ... more mappings
}

def update_file_imports(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for pattern, replacement in IMPORT_MAPPINGS.items():
        content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
```

### Step 4: Update Entry Points

**src/main.py:**
```python
"""
CuePoint CLI entry point.
"""
import sys
from cuepoint.ui.main_window import MainWindow
from PySide6.QtWidgets import QApplication

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
```

**src/gui_app.py:**
```python
"""
CuePoint GUI application entry point.
"""
import sys
from cuepoint.ui.main_window import MainWindow
from PySide6.QtWidgets import QApplication

def run_gui():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()

if __name__ == "__main__":
    sys.exit(run_gui())
```

### Step 5: Update Build Configuration

**setup.py:**
```python
from setuptools import setup, find_packages

setup(
    name="cuepoint",
    version="1.0.0",
    description="Beatport Metadata Enricher",
    author="Your Name",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.7",
    install_requires=[
        # ... dependencies
    ],
    entry_points={
        "console_scripts": [
            "cuepoint=main:main",
        ],
        "gui_scripts": [
            "cuepoint-gui=gui_app:run_gui",
        ],
    },
)
```

**pyproject.toml:**
```toml
[build-system]
requires = ["setuptools>=45", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "cuepoint"
version = "1.0.0"
description = "Beatport Metadata Enricher"
requires-python = ">=3.7"
dependencies = [
    # ... dependencies
]

[tool.setuptools]
packages = ["cuepoint"]
package-dir = {"" = "src"}
```

---

## Testing Strategy

### After Each Migration Step

1. **Import Test**
   ```python
   # test_imports.py
   try:
       from cuepoint.core.matcher import best_beatport_match
       from cuepoint.services.processor import process_playlist
       from cuepoint.ui.main_window import MainWindow
       print("✅ All imports successful")
   except ImportError as e:
       print(f"❌ Import error: {e}")
   ```

2. **Functionality Test**
   - Run the application
   - Test basic functionality
   - Verify no runtime errors

3. **Integration Test**
   - Test that modules can communicate
   - Test that UI can access services
   - Test that services can access data layer

---

## Rollback Plan

If issues arise:

1. **Keep Old Structure**
   - Don't delete old files immediately
   - Keep both structures until migration is complete

2. **Version Control**
   - Commit after each successful migration step
   - Use feature branch for restructuring
   - Easy to rollback if needed

3. **Gradual Migration**
   - Move files incrementally
   - Test after each move
   - Fix issues before proceeding

---

## Implementation Checklist

- [ ] Create all directory structures
- [ ] Create all `__init__.py` files
- [ ] Create entry point files
- [ ] Map all existing files to new locations
- [ ] Move core modules (`matcher.py`, `parser.py`, etc.)
- [ ] Update imports in core modules
- [ ] Move data modules (`beatport.py`, `cache.py`)
- [ ] Update imports in data modules
- [ ] Move UI modules
- [ ] Update imports in UI modules
- [ ] Move service modules
- [ ] Update imports in service modules
- [ ] Create model modules (if needed)
- [ ] Create utility modules
- [ ] Create exception modules
- [ ] Update all import statements throughout codebase
- [ ] Update entry point files
- [ ] Update build configuration (`setup.py` or `pyproject.toml`)
- [ ] Update `requirements.txt`
- [ ] Test all imports work
- [ ] Test application runs
- [ ] Test all functionality works
- [ ] Update documentation paths
- [ ] Commit changes to version control

---

## Common Issues and Solutions

### Issue 1: Circular Imports
**Solution**: Use absolute imports and avoid circular dependencies. If needed, use lazy imports or refactor to break cycles.

### Issue 2: Relative Import Errors
**Solution**: Use absolute imports from package root. Ensure `src` is in Python path or install package in development mode.

### Issue 3: Missing `__init__.py` Files
**Solution**: Ensure all package directories have `__init__.py` files (can be empty).

### Issue 4: Path Issues in Entry Points
**Solution**: Update entry points to use absolute imports. Ensure package is installed or `src` is in path.

---

## Next Steps

After completing this step:
1. Verify all imports work
2. Run full test suite (if exists)
3. Test application functionality
4. Proceed to Step 6.2: Implement Dependency Injection & Service Layer

---

## Notes

- This is a foundational step - take time to do it correctly
- Test thoroughly after each migration
- Keep old structure until migration is complete and verified
- Document any deviations from the plan
- Update team on progress

