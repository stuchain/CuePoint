#!/bin/bash
# Organize root directory files into proper folders
# Moves documentation to docs/guides/ and scripts to scripts/

echo "========================================"
echo "Root Directory Files Organization"
echo "========================================"
echo ""
echo "This will organize files into:"
echo "  - docs/guides/     (documentation files)"
echo "  - scripts/         (utility scripts)"
echo ""
echo "Essential files (config, requirements, launch scripts) stay in root."
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Create directories
echo "Creating directories..."
mkdir -p "docs/guides"
mkdir -p "scripts"

# Move documentation files to docs/guides/
echo "Moving documentation files..."
[ -f "CLEANUP_PLAN.md" ] && mv "CLEANUP_PLAN.md" "docs/guides/"
[ -f "fix-pyside6-macos.md" ] && mv "fix-pyside6-macos.md" "docs/guides/"
[ -f "install-macos.md" ] && mv "install-macos.md" "docs/guides/"
[ -f "how-to-see-shortcuts.md" ] && mv "how-to-see-shortcuts.md" "docs/guides/"
[ -f "ORGANIZE_FILES.md" ] && mv "ORGANIZE_FILES.md" "docs/guides/"
[ -f "ROOT_FILES_ORGANIZATION.md" ] && mv "ROOT_FILES_ORGANIZATION.md" "docs/guides/"

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
echo "  docs/guides/     - Documentation files"
echo "  scripts/         - Utility scripts"
echo ""
echo "Essential files remain in root:"
echo "  - Configuration files (.coveragerc, .gitignore, etc.)"
echo "  - Requirements files (requirements.txt, etc.)"
echo "  - Launch scripts (run_gui.bat, run_gui.sh, etc.)"
echo "  - README.md"
echo ""

