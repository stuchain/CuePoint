#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sync Python Version Across Project

This script ensures all files use the same Python version:
- .python-version
- GitHub workflows
- Documentation
- Any other version references

Usage:
    python scripts/sync_python_version.py [version]
    
If version is not provided, uses current Python version.
"""

import sys
import re
from pathlib import Path

def get_current_python_version():
    """Get current Python version as X.Y format."""
    return f"{sys.version_info.major}.{sys.version_info.minor}"

def update_python_version_file(version):
    """Update .python-version file."""
    project_root = Path(__file__).parent.parent
    version_file = project_root / '.python-version'
    
    if version_file.exists():
        current = version_file.read_text().strip()
        if current != version:
            version_file.write_text(f"{version}\n")
            print(f"Updated .python-version: {current} -> {version}")
            return True
        else:
            print(f".python-version already set to {version}")
            return False
    else:
        version_file.write_text(f"{version}\n")
        print(f"Created .python-version with {version}")
        return True

def update_workflow_files(version):
    """Update GitHub workflow files to use the specified Python version."""
    project_root = Path(__file__).parent.parent
    workflows_dir = project_root / '.github' / 'workflows'
    
    if not workflows_dir.exists():
        print("No .github/workflows directory found")
        return False
    
    updated = False
    pattern = re.compile(r"python-version:\s*['\"]?3\.\d+['\"]?")
    
    for workflow_file in workflows_dir.glob('*.yml'):
        content = workflow_file.read_text(encoding='utf-8')
        new_content = pattern.sub(f"python-version: '{version}'", content)
        
        if content != new_content:
            workflow_file.write_text(new_content, encoding='utf-8')
            print(f"Updated {workflow_file.name}: -> {version}")
            updated = True
    
    return updated

def main():
    """Main function."""
    if len(sys.argv) > 1:
        version = sys.argv[1]
        # Validate version format
        if not re.match(r'^\d+\.\d+$', version):
            print(f"Error: Invalid version format '{version}'. Use X.Y format (e.g., 3.13)")
            sys.exit(1)
    else:
        version = get_current_python_version()
        print(f"Using current Python version: {version}")
    
    print(f"\nSyncing Python version to {version} across project...")
    print("=" * 60)
    
    # Update .python-version
    update_python_version_file(version)
    
    # Update workflows
    update_workflow_files(version)
    
    print("=" * 60)
    print(f"Python version {version} synced across project!")
    print("\nNext steps:")
    print("1. Review the changes")
    print("2. Commit if satisfied")
    print("3. Rebuild: python scripts/build_pyinstaller.py")

if __name__ == '__main__':
    main()
