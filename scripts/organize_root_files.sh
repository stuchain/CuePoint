#!/bin/bash
# Organize root directory files into proper folders
# Moves documentation to DOCS/GUIDES/ and scripts to scripts/

echo "========================================"
echo "Root Directory Files Organization"
echo "========================================"
echo ""
echo "This will organize files into:"
echo "  - DOCS/GUIDES/     (documentation files)"
echo "  - scripts/         (utility scripts)"
echo ""
echo "Essential files (config, requirements, launch scripts) stay in root."
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create directories
echo "Creating directories..."
mkdir -p "DOCS/GUIDES"
mkdir -p "scripts"

# Move documentation files to DOCS/GUIDES/
echo "Moving documentation files..."
[ -f "CLEANUP_PLAN.md" ] && mv "CLEANUP_PLAN.md" "DOCS/GUIDES/"
[ -f "fix-pyside6-macos.md" ] && mv "fix-pyside6-macos.md" "DOCS/GUIDES/"
[ -f "install-macos.md" ] && mv "install-macos.md" "DOCS/GUIDES/"
[ -f "how-to-see-shortcuts.md" ] && mv "how-to-see-shortcuts.md" "DOCS/GUIDES/"
[ -f "ORGANIZE_FILES.md" ] && mv "ORGANIZE_FILES.md" "DOCS/GUIDES/"
[ -f "ROOT_FILES_ORGANIZATION.md" ] && mv "ROOT_FILES_ORGANIZATION.md" "DOCS/GUIDES/"

# Move utility scripts to scripts/
echo "Moving utility scripts..."
[ -f "cleanup_files.bat" ] && mv "cleanup_files.bat" "scripts/"
[ -f "cleanup_files.sh" ] && mv "cleanup_files.sh" "scripts/"
[ -f "organize_old_files.bat" ] && mv "organize_old_files.bat" "scripts/"
[ -f "organize_old_files.sh" ] && mv "organize_old_files.sh" "scripts/"

echo ""
echo "========================================"
echo "Organization complete!"
echo "========================================"
echo ""
echo "Files moved:"
echo "  DOCS/GUIDES/     - Documentation files"
echo "  scripts/         - Utility scripts"
echo ""
echo "Essential files remain in root:"
echo "  - Configuration files (.coveragerc, .gitignore, etc.)"
echo "  - Requirements files (requirements.txt, etc.)"
echo "  - Launch scripts (run_gui.bat, run_gui.sh, etc.)"
echo "  - README.md"
echo ""

