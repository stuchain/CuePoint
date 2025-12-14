#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Build script for PyInstaller
Wrapper script to build application with PyInstaller
"""

import os
import subprocess
import sys
from pathlib import Path


def build():
    """Build application with PyInstaller"""
    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    spec_file = project_root / 'build' / 'pyinstaller.spec'
    
    if not spec_file.exists():
        print(f"Error: Spec file not found: {spec_file}")
        sys.exit(1)
    
    print(f"Building with PyInstaller using {spec_file}...")
    print(f"Project root: {project_root}")
    
    # Change to project root so paths in spec file work correctly
    original_cwd = os.getcwd()
    os.chdir(project_root)
    
    try:
        # Run PyInstaller (use python -m to ensure it's found)
        cmd = [sys.executable, '-m', 'PyInstaller', '--clean', '--noconfirm', str(spec_file.relative_to(project_root))]
        result = subprocess.run(cmd, check=False, cwd=project_root)
    finally:
        os.chdir(original_cwd)
    
    if result.returncode != 0:
        print("Error: PyInstaller build failed")
        sys.exit(1)
    
    print("Build completed successfully")
    print(f"Output directory: dist/")


if __name__ == '__main__':
    build()
