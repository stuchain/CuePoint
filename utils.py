#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Utility functions for logging and timestamps

This module provides helper functions for:
1. Logging: Verbose and trace-level logging functions
2. Timestamps: Generating timestamps for file names
3. Startup banner: Displaying configuration fingerprint on startup
"""

import argparse
import hashlib
import os
import sys
import time

from config import SETTINGS, HAVE_CACHE


def vlog(idx, *args):
    """
    Verbose logging function
    
    Only prints if VERBOSE setting is enabled.
    Used for detailed progress information during processing.
    
    Args:
        idx: Track index or identifier (for prefix)
        *args: Items to print
    """
    if SETTINGS["VERBOSE"]:
        print(f"[{idx}]  ", *args, flush=True)


def tlog(idx, *args):
    """
    Trace logging function (very detailed)
    
    Only prints if TRACE setting is enabled.
    Used for extremely detailed debugging (every candidate evaluated, etc.).
    
    Args:
        idx: Track index or identifier (for prefix)
        *args: Items to print
    """
    if SETTINGS["TRACE"]:
        print(f"[{idx}]    ", *args, flush=True)


def timestamp_now():
    """
    Get current timestamp as formatted string
    
    Format: "YYYY-MM-DD HH-MM-SS"
    Example: "2025-11-02 21-57-13"
    
    Returns:
        Timestamp string
    """
    return time.strftime("%Y-%m-%d %H-%M-%S")


def with_timestamp(path: str) -> str:
    """
    Add timestamp to a file path
    
    Inserts timestamp before file extension to prevent overwriting.
    
    Example:
        "output.csv" → "output (2025-11-02 21-57-13).csv"
    
    Args:
        path: Original file path
    
    Returns:
        Path with timestamp inserted
    """
    base, ext = os.path.splitext(path)
    ts = timestamp_now()
    return f"{base} ({ts}){ext or '.csv'}"


def startup_banner(script_path: str, args_namespace: argparse.Namespace):
    """
    Print startup banner with configuration fingerprint
    
    Displays:
    - Script path
    - Python version
    - Random seed (for reproducibility)
    - Configuration fingerprint (SHA1 hash of settings)
    - Cache status
    
    The fingerprint helps identify the exact configuration used for a run,
    useful for debugging and reproducing results.
    
    Args:
        script_path: Path to the main script
        args_namespace: Parsed command-line arguments
    """
    # Generate fingerprint from script path, Python version, settings, and arguments
    data = f"{script_path}|{sys.version}|{SETTINGS}|{args_namespace}"
    short = hashlib.sha1(data.encode("utf-8")).hexdigest()[:8]
    print(f"> Rekordbox->Beatport Enricher  |  {os.path.abspath(script_path)}", flush=True)
    print(f"  Python: {sys.version.split()[0]}  |  Seed: {SETTINGS['SEED']}  |  Fingerprint: {short}", flush=True)
    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        print("  Cache: enabled (requests-cache)", flush=True)
    print("", flush=True)

