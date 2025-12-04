# DOCS Folder Reorganization Plan

## Current Issues

1. **Duplicate Phase Files**: Some phases have both `.md` files and folders (e.g., `04_Phase_4_Advanced_Features.md` and `04_Phase_4_Advanced_Features/`)
2. **Mixed Status**: Completed phases mixed with future/planned phases
3. **Design Documents**: All designs in one folder, no indication of implementation status
4. **Root-Level Files**: Some important docs at root level that could be better organized

## Proposed Structure

```
DOCS/
├── README.md                    # Main documentation index
├── GUIDES/                       # User guides (already organized)
│   └── ...
├── DEVELOPMENT/                  # Developer documentation
│   ├── guidelines/              # Coding standards, testing, error handling
│   │   ├── coding_standards.md
│   │   ├── testing_guidelines.md
│   │   └── error_handling_guidelines.md
│   └── architecture/            # Architecture docs
│       ├── search_architecture.md
│       └── performance_characteristics.md
├── PHASES/                      # Phase documentation
│   ├── completed/              # Completed phases (0-7)
│   │   ├── Phase_0_Backend_Foundation.md
│   │   ├── Phase_1_GUI_Foundation.md
│   │   ├── Phase_2_GUI_User_Experience.md
│   │   ├── Phase_3_Reliability_Performance.md
│   │   ├── Phase_4_Advanced_Features/
│   │   ├── Phase_5_Code_Restructuring/
│   │   ├── Phase_6_UI_Restructuring/
│   │   └── Phase_7_Packaging_Polish.md
│   ├── in_progress/            # Current work
│   │   └── Phase_8_Async_IO/
│   └── future/                 # Future/planned features
│       └── Future_Features/
├── DESIGNS/                     # Design documents
│   ├── implemented/            # Designs that have been implemented
│   │   ├── 00_Desktop_GUI_Application_Design.md
│   │   ├── 01_Progress_Bar_Design.md
│   │   ├── 03_YAML_Configuration_Design.md
│   │   ├── 04_Data_Model_Migration_Design.md
│   │   ├── 05_CLI_Migration_Design.md
│   │   └── ...
│   ├── future/                 # Future design ideas
│   │   ├── 11_Web_Interface_Design.md
│   │   ├── 13_PyPI_Packaging_Design.md
│   │   ├── 14_Docker_Containerization_Design.md
│   │   └── ...
│   └── ARCHIVE/                # Old/outdated designs
│       └── DESIGN_REVIEW.md
└── ARCHIVE/                     # Old/outdated documentation
    └── MASTER_PLAN.md (if outdated)
```

## Files to Move/Organize

### Development Guidelines → `DEVELOPMENT/guidelines/`
- `ERROR_HANDLING_GUIDELINES.md`
- `TESTING_GUIDELINES.md`
- `development/coding_standards.md` → `DEVELOPMENT/guidelines/coding_standards.md`

### Architecture Docs → `DEVELOPMENT/architecture/`
- `SEARCH_ARCHITECTURE.md`
- `PERFORMANCE_CHARACTERISTICS.md`

### Phase Organization
- Move completed phases (0-7) to `PHASES/completed/`
- Keep Phase 8 in `PHASES/in_progress/` (if still active)
- Move `!Future_Features/` to `PHASES/future/Future_Features/`
- Remove duplicate `.md` files when folder exists

### Design Organization
- Move implemented designs to `DESIGNS/implemented/`
- Move future designs to `DESIGNS/future/`
- Archive old designs to `DESIGNS/ARCHIVE/`

## Files to Remove/Archive

- Duplicate phase summary files (when detailed folder exists)
- `DESIGN_REVIEW.md` (if outdated)
- `MASTER_PLAN.md` (if outdated, move to ARCHIVE)

