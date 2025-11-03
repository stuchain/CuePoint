#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Wrapper script to run the main application from the SRC directory.

This script ensures proper Python path handling when running from the project root.
The working directory remains at the project root so file paths work correctly.
"""

import sys
import os

# Get project root directory (where this script is located)
project_root = os.path.dirname(os.path.abspath(__file__))
src_path = os.path.join(project_root, 'SRC')

# Add SRC directory to Python path so imports work
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Store original working directory (should be project root)
original_cwd = os.getcwd()

# Ensure we're in project root (important for relative file paths)
if original_cwd != project_root:
    os.chdir(project_root)

# Import and run main function from SRC/main.py
from main import main

if __name__ == "__main__":
    main()

