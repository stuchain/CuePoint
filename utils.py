#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Utility functions for logging and timestamps
"""

import argparse
import hashlib
import os
import sys
import time

from config import SETTINGS, HAVE_CACHE


def vlog(idx, *args):
    """Verbose logging"""
    if SETTINGS["VERBOSE"]:
        print(f"[{idx}]  ", *args, flush=True)


def tlog(idx, *args):
    """Trace logging"""
    if SETTINGS["TRACE"]:
        print(f"[{idx}]    ", *args, flush=True)


def timestamp_now():
    """Get current timestamp as formatted string"""
    return time.strftime("%Y-%m-%d %H-%M-%S")


def with_timestamp(path: str) -> str:
    """Add timestamp to a file path"""
    base, ext = os.path.splitext(path)
    ts = timestamp_now()
    return f"{base} ({ts}){ext or '.csv'}"


def startup_banner(script_path: str, args_namespace: argparse.Namespace):
    """Print startup banner with fingerprint"""
    data = f"{script_path}|{sys.version}|{SETTINGS}|{args_namespace}"
    short = hashlib.sha1(data.encode("utf-8")).hexdigest()[:8]
    print(f"> Rekordbox->Beatport Enricher  |  {os.path.abspath(script_path)}", flush=True)
    print(f"  Python: {sys.version.split()[0]}  |  Seed: {SETTINGS['SEED']}  |  Fingerprint: {short}", flush=True)
    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        print("  Cache: enabled (requests-cache)", flush=True)
    print("", flush=True)

