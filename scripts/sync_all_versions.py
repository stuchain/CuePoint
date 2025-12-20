#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sync All Versions Across Project

This script ensures all versions are synchronized across:
- Python version (.python-version, workflows)
- Dependency versions (requirements files)
- Build configurations

Usage:
    python scripts/sync_all_versions.py [--update-deps]
    
Options:
    --update-deps    Also update dependencies to latest compatible versions
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import List

def get_current_python_version() -> str:
    """Get current Python version as X.Y format."""
    return f"{sys.version_info.major}.{sys.version_info.minor}"

def update_python_version_files(version: str) -> int:
    """Update Python version in .python-version and workflows.
    
    Returns:
        Number of files updated
    """
    project_root = Path(__file__).parent.parent
    updated = 0
    
    # Update .python-version
    version_file = project_root / '.python-version'
    if version_file.exists():
        current = version_file.read_text().strip()
        if current != version:
            version_file.write_text(f"{version}\n")
            print(f"[OK] Updated .python-version: {current} -> {version}")
            updated += 1
    
    # Update workflows
    workflows_dir = project_root / '.github' / 'workflows'
    if workflows_dir.exists():
        pattern = re.compile(r"python-version:\s*['\"]?3\.\d+['\"]?")
        for workflow_file in workflows_dir.glob('*.yml'):
            content = workflow_file.read_text(encoding='utf-8')
            new_content = pattern.sub(f"python-version: '{version}'", content)
            if content != new_content:
                workflow_file.write_text(new_content, encoding='utf-8')
                print(f"[OK] Updated {workflow_file.name}")
                updated += 1
    
    return updated

def update_dependencies_to_latest() -> int:
    """Update all requirements files to use latest compatible versions.
    
    Returns:
        Number of files updated
    """
    project_root = Path(__file__).parent.parent
    updated = 0
    
    requirements_files = [
        project_root / 'requirements.txt',
        project_root / 'requirements-dev.txt',
        project_root / 'requirements-build.txt',
    ]
    
    for req_file in requirements_files:
        if not req_file.exists():
            continue
        
        content = req_file.read_text(encoding='utf-8')
        lines = content.split('\n')
        new_lines = []
        changed = False
        
        for line in lines:
            original = line
            
            # Change == to >= for pinned versions
            if re.match(r'^[a-zA-Z0-9_-]+==', line):
                line = re.sub(r'==', '>=', line, count=1)
                if line != original:
                    changed = True
            
            new_lines.append(line)
        
        if changed:
            req_file.write_text('\n'.join(new_lines), encoding='utf-8')
            print(f"[OK] Updated {req_file.name} (changed == to >=)")
            updated += 1
    
    return updated

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description='Sync all versions across project')
    parser.add_argument(
        '--update-deps',
        action='store_true',
        help='Also update dependencies to use >= instead of =='
    )
    parser.add_argument(
        '--python-version',
        type=str,
        help='Python version to use (e.g., 3.14). If not specified, uses current Python version.'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("Sync All Versions Across Project")
    print("=" * 70)
    print()
    
    # Determine Python version
    if args.python_version:
        python_version = args.python_version
    else:
        python_version = get_current_python_version()
        print(f"Using current Python version: {python_version}")
    
    print(f"\n1. Syncing Python version to {python_version}...")
    py_files_updated = update_python_version_files(python_version)
    print(f"   Updated {py_files_updated} file(s)")
    
    if args.update_deps:
        print(f"\n2. Updating dependencies to use latest versions...")
        deps_files_updated = update_dependencies_to_latest()
        print(f"   Updated {deps_files_updated} file(s)")
    else:
        print(f"\n2. Skipping dependency updates (use --update-deps to enable)")
    
    print("\n" + "=" * 70)
    print("[OK] Version sync complete!")
    print()
    print("Next steps:")
    print("1. Review the changes")
    if args.update_deps:
        print("2. Install updated dependencies: pip install -r requirements-build.txt")
    print("3. Test the build: python scripts/build_pyinstaller.py")
    print("4. Commit if satisfied")
    print("=" * 70)

if __name__ == '__main__':
    main()
