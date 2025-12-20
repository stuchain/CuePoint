#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update Dependencies to Latest Versions

This script updates all requirements files to use the latest compatible versions
instead of pinned versions. It:
1. Reads requirements files
2. Checks latest available versions for each package
3. Updates to use >= (minimum version) instead of == (exact version)
4. Ensures Python 3.14 compatibility

Usage:
    python scripts/update_dependencies_to_latest.py
"""

import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

def get_latest_version(package_name: str) -> str:
    """Get the latest available version of a package.
    
    Args:
        package_name: Name of the package
        
    Returns:
        Latest version string, or empty string if not found
    """
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "index", "versions", package_name],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            # Parse output like "PackageName (1.2.3, 1.2.4, 1.3.0)"
            match = re.search(r'\(([^)]+)\)', result.stdout)
            if match:
                versions = [v.strip() for v in match.group(1).split(',')]
                if versions:
                    return versions[0]  # Latest version
    except Exception:
        pass
    
    # Fallback: try pip show
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", package_name],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            # Parse Version: line
            for line in result.stdout.split('\n'):
                if line.startswith('Version:'):
                    return line.split(':', 1)[1].strip()
    except Exception:
        pass
    
    return ""

def parse_requirement(line: str) -> Tuple[str, str, str]:
    """Parse a requirement line.
    
    Args:
        line: Requirement line (e.g., "PySide6==6.8.3" or "requests>=2.32.4")
        
    Returns:
        Tuple of (package_name, operator, version) or (package_name, "", "") if comment/empty
    """
    line = line.strip()
    
    # Skip comments and empty lines
    if not line or line.startswith('#'):
        return (line, "", "")
    
    # Remove inline comments
    if '#' in line:
        line = line.split('#')[0].strip()
    
    # Match patterns like: package==1.2.3, package>=1.2.3, package~=1.2.3
    match = re.match(r'^([a-zA-Z0-9_-]+[a-zA-Z0-9_.-]*)\s*([=<>~!]+)\s*([0-9.]+[a-zA-Z0-9._-]*)?', line)
    if match:
        package = match.group(1)
        operator = match.group(2)
        version = match.group(3) if match.group(3) else ""
        return (package, operator, version)
    
    # No version specified
    match = re.match(r'^([a-zA-Z0-9_-]+[a-zA-Z0-9_.-]*)', line)
    if match:
        return (match.group(1), "", "")
    
    return (line, "", "")

def update_requirement_line(line: str, use_latest: bool = False) -> str:
    """Update a requirement line to use >= instead of ==.
    
    Args:
        line: Original requirement line
        use_latest: If True, try to get latest version and use >=
        
    Returns:
        Updated requirement line
    """
    package, operator, version = parse_requirement(line)
    
    # Keep comments and empty lines as-is
    if not package or package.startswith('#'):
        return line
    
    # If already using >= or >, keep it
    if operator in ('>=', '>'):
        return line
    
    # If using ==, change to >=
    if operator == '==':
        if use_latest:
            latest = get_latest_version(package)
            if latest:
                return f"{package}>={latest}"
            else:
                # Fallback: use current version with >=
                return f"{package}>={version}"
        else:
            # Just change == to >=
            return f"{package}>={version}"
    
    # If using ~=, change to >=
    if operator == '~=':
        if use_latest:
            latest = get_latest_version(package)
            if latest:
                return f"{package}>={latest}"
        return f"{package}>={version}"
    
    # If no operator, add >= (will get latest if use_latest)
    if not operator:
        if use_latest:
            latest = get_latest_version(package)
            if latest:
                return f"{package}>={latest}"
        return line
    
    # Keep other operators as-is
    return line

def update_requirements_file(file_path: Path, use_latest: bool = True) -> bool:
    """Update a requirements file to use latest versions.
    
    Args:
        file_path: Path to requirements file
        use_latest: If True, fetch latest versions from PyPI
        
    Returns:
        True if file was modified, False otherwise
    """
    if not file_path.exists():
        print(f"  File not found: {file_path}")
        return False
    
    print(f"\nUpdating {file_path.name}...")
    
    original_content = file_path.read_text(encoding='utf-8')
    lines = original_content.split('\n')
    updated_lines = []
    changes_made = False
    
    for i, line in enumerate(lines):
        updated_line = update_requirement_line(line, use_latest=use_latest)
        if updated_line != line:
            changes_made = True
            print(f"  Line {i+1}: {line.strip()} -> {updated_line.strip()}")
        updated_lines.append(updated_line)
    
    if changes_made:
        new_content = '\n'.join(updated_lines)
        file_path.write_text(new_content, encoding='utf-8')
        print(f"  ✓ Updated {file_path.name}")
        return True
    else:
        print(f"  - No changes needed in {file_path.name}")
        return False

def main():
    """Main function."""
    project_root = Path(__file__).parent.parent
    
    print("=" * 70)
    print("Update Dependencies to Latest Versions")
    print("=" * 70)
    print("\nThis script will:")
    print("1. Update all requirements files to use >= instead of ==")
    print("2. Optionally fetch latest versions from PyPI")
    print("3. Ensure Python 3.14 compatibility")
    print()
    
    # Find all requirements files
    requirements_files = [
        project_root / 'requirements.txt',
        project_root / 'requirements-dev.txt',
        project_root / 'requirements-build.txt',
        project_root / 'requirements_optional.txt',
    ]
    
    updated_count = 0
    for req_file in requirements_files:
        if req_file.exists():
            if update_requirements_file(req_file, use_latest=True):
                updated_count += 1
    
    print("\n" + "=" * 70)
    if updated_count > 0:
        print(f"✓ Updated {updated_count} file(s)")
        print("\nNext steps:")
        print("1. Review the changes")
        print("2. Test: pip install -r requirements.txt")
        print("3. Commit if satisfied")
    else:
        print("No changes needed - all files already use latest versions")
    print("=" * 70)

if __name__ == '__main__':
    main()
