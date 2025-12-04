# Root Directory Files Organization Plan

## Files That MUST Stay in Root

These files **must** remain in the root directory because tools expect them there:

### Configuration Files (Tools Look for These in Root)
- ✅ `.coveragerc` - Coverage tool expects this in root
- ✅ `.editorconfig` - Editor config (standard location)
- ✅ `.gitignore` - Git expects this in root
- ✅ `.pre-commit-config.yaml` - Pre-commit expects this in root
- ✅ `.pylintrc` - Pylint expects this in root
- ✅ `mypy.ini` - MyPy expects this in root
- ✅ `pyproject.toml` - Python project config (standard location)
- ✅ `pytest.ini` - Pytest expects this in root
- ✅ `Makefile` - Build tool (convention: root directory)

### Dependency Files (Standard Location)
- ✅ `requirements.txt` - Standard location for pip
- ✅ `requirements-dev.txt` - Standard location
- ✅ `requirements_optional.txt` - Standard location

### Entry Point
- ✅ `main.py` - Entry point script (user convenience)

---

## Files That SHOULD Stay in Root (User Convenience)

These files should stay in root for easy access by users:

### Launch Scripts (User-Facing)
- ✅ `run_gui.bat` - Windows launcher (double-click convenience)
- ✅ `run_gui.sh` - Linux/macOS launcher (easy to find)
- ✅ `run_gui.command` - macOS double-click launcher
- ✅ `install_requirements.sh` - Installation script (user convenience)

### Main Documentation
- ✅ `README.md` - **MUST stay in root** (GitHub/GitLab requirement)

### Configuration Template
- ✅ `config.yaml.template` - User-facing template (easy to find)

---

## Files That CAN Be Organized

These files can be moved to organized folders:

### Documentation Files → `DOCS/GUIDES/`
- 📁 `CLEANUP_PLAN.md` → `DOCS/GUIDES/`
- 📁 `FIX_PYSIDE6_MACOS.md` → `DOCS/GUIDES/`
- 📁 `INSTALL_MACOS.md` → `DOCS/GUIDES/`
- 📁 `HOW_TO_SEE_SHORTCUTS.md` → `DOCS/GUIDES/`
- 📁 `ORGANIZE_FILES.md` → `DOCS/GUIDES/`
- 📁 `ROOT_FILES_ORGANIZATION.md` → `DOCS/GUIDES/` (this file)

### Utility Scripts → `scripts/` (NEW FOLDER)
- 📁 `cleanup_files.bat` → `scripts/`
- 📁 `cleanup_files.sh` → `scripts/`
- 📁 `organize_old_files.bat` → `scripts/`
- 📁 `organize_old_files.sh` → `scripts/`

---

## Recommended Structure

```
CuePoint/
├── .coveragerc              # ✅ STAY (tool requirement)
├── .editorconfig            # ✅ STAY (tool requirement)
├── .gitignore               # ✅ STAY (tool requirement)
├── .pre-commit-config.yaml  # ✅ STAY (tool requirement)
├── .pylintrc                # ✅ STAY (tool requirement)
├── mypy.ini                  # ✅ STAY (tool requirement)
├── pyproject.toml            # ✅ STAY (tool requirement)
├── pytest.ini                # ✅ STAY (tool requirement)
├── Makefile                  # ✅ STAY (convention)
├── requirements.txt          # ✅ STAY (standard location)
├── requirements-dev.txt      # ✅ STAY (standard location)
├── requirements_optional.txt # ✅ STAY (standard location)
├── main.py                   # ✅ STAY (entry point)
├── README.md                 # ✅ STAY (GitHub requirement)
├── config.yaml.template      # ✅ STAY (user convenience)
├── run_gui.bat               # ✅ STAY (user convenience)
├── run_gui.sh                # ✅ STAY (user convenience)
├── run_gui.command           # ✅ STAY (user convenience)
├── install_requirements.sh   # ✅ STAY (user convenience)
├── scripts/                  # 📁 NEW - Utility scripts
│   ├── cleanup_files.bat
│   ├── cleanup_files.sh
│   ├── organize_old_files.bat
│   └── organize_old_files.sh
├── DOCS/
│   ├── GUIDES/               # 📁 NEW - User guides
│   │   ├── CLEANUP_PLAN.md
│   │   ├── FIX_PYSIDE6_MACOS.md
│   │   ├── INSTALL_MACOS.md
│   │   ├── HOW_TO_SEE_SHORTCUTS.md
│   │   ├── ORGANIZE_FILES.md
│   │   └── ROOT_FILES_ORGANIZATION.md
│   ├── PHASES/
│   ├── DESIGNS/
│   └── ...
├── SRC/
├── config/
└── ...
```

---

## Benefits of This Organization

1. **Cleaner Root**: Only essential files visible
2. **Better Discoverability**: Guides grouped together
3. **Maintained Functionality**: All tools still work
4. **User-Friendly**: Launch scripts remain accessible
5. **Professional Structure**: Follows Python project conventions

---

## Implementation

Run the organization script to move files:
- `organize_root_files.bat` (Windows)
- `organize_root_files.sh` (macOS/Linux)

