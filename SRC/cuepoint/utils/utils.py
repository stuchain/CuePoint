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

from cuepoint.models.config import SETTINGS, HAVE_CACHE
import random
from functools import wraps
from typing import Callable, Any, Optional, Type, Tuple, Union


def vlog(idx: Union[int, str], *args: Any) -> None:
    """
    Verbose logging function
    
    Only prints if VERBOSE setting is enabled.
    Used for detailed progress information during processing.
    
    Args:
        idx: Track index or identifier (for prefix).
        *args: Items to print (any type, will be converted to string).
    
    Example:
        >>> vlog(1, "Processing track", "Title")
        [1]   Processing track Title
    """
    if SETTINGS["VERBOSE"]:
        print(f"[{idx}]  ", *args, flush=True)


def tlog(idx: Union[int, str], *args: Any) -> None:
    """
    Trace logging function (very detailed)
    
    Only prints if TRACE setting is enabled.
    Used for extremely detailed debugging (every candidate evaluated, etc.).
    
    Args:
        idx: Track index or identifier (for prefix).
        *args: Items to print (any type, will be converted to string).
    
    Example:
        >>> tlog(1, "Candidate", 1, "score:", 0.95)
        [1]     Candidate 1 score: 0.95
    """
    if SETTINGS["TRACE"]:
        print(f"[{idx}]    ", *args, flush=True)


def timestamp_now() -> str:
    """
    Get current timestamp as formatted string
    
    Format: "dd/mm/yy HH:MM"
    Example: "27/01/25 14:30"
    
    Returns:
        Timestamp string in format "dd/mm/yy HH:MM".
    
    Example:
        >>> ts = timestamp_now()
        >>> print(ts)
        27/01/25 14:30
    """
    return time.strftime("%d/%m/%y %H:%M")


def with_timestamp(path: str) -> str:
    """
    Add timestamp to a file path
    
    Inserts timestamp before file extension to prevent overwriting.
    Timestamp is sanitized for Windows filename compatibility:
    - Forward slashes replaced with dashes
    - Colons replaced with dashes (Windows doesn't allow colons in filenames)
    
    Example:
        "output.csv" → "output (27-01-25 14-30).csv"
    
    Args:
        path: Original file path
    
    Returns:
        Path with timestamp inserted (sanitized for filenames)
    """
    base, ext = os.path.splitext(path)
    ts = timestamp_now()
    # Replace forward slashes and colons with dashes for Windows filename compatibility
    # Windows doesn't allow : / < > | " ? * in filenames
    ts_safe = ts.replace('/', '-').replace(':', '-')
    return f"{base} ({ts_safe}){ext or '.csv'}"


def startup_banner(script_path: str, args_namespace: argparse.Namespace) -> None:
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
        script_path: Path to the main script.
        args_namespace: Parsed command-line arguments (argparse.Namespace).
    
    Example:
        >>> import argparse
        >>> args = argparse.Namespace(verbose=True, output="out.csv")
        >>> startup_banner("main.py", args)
        > Rekordbox->Beatport Enricher  |  /path/to/main.py
          Python: 3.9.0  |  Seed: 42  |  Fingerprint: a1b2c3d4
          Cache: enabled (requests-cache)
    """
    # Generate fingerprint from script path, Python version, settings, and arguments
    data = f"{script_path}|{sys.version}|{SETTINGS}|{args_namespace}"
    short = hashlib.sha1(data.encode("utf-8")).hexdigest()[:8]
    print(f"> Rekordbox->Beatport Enricher  |  {os.path.abspath(script_path)}", flush=True)
    print(f"  Python: {sys.version.split()[0]}  |  Seed: {SETTINGS['SEED']}  |  Fingerprint: {short}", flush=True)
    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        print("  Cache: enabled (requests-cache)", flush=True)
    print("", flush=True)


def retry_with_backoff(
    max_retries: int = 3,
    backoff_base: float = 1.0,
    backoff_max: float = 60.0,
    jitter: bool = True,
    exceptions: Optional[Tuple[Type[Exception], ...]] = None
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator for automatic retry with exponential backoff
    
    Implements exponential backoff retry logic for functions that may fail
    due to transient errors (network issues, timeouts, etc.). The delay
    between retries doubles each attempt, up to a maximum delay.
    
    Args:
        max_retries: Maximum number of retry attempts (default: 3).
        backoff_base: Base delay in seconds (doubles each retry, default: 1.0).
        backoff_max: Maximum delay in seconds (default: 60.0).
        jitter: Add random jitter (0-10% of delay) to prevent thundering herd
            (default: True).
        exceptions: Tuple of exception types to catch and retry. If None,
            defaults to common network exceptions (RequestException, Timeout,
            ConnectionError, HTTPError, SSLError).
    
    Returns:
        Decorator function that wraps the target function with retry logic.
    
    Example:
        >>> @retry_with_backoff(max_retries=3, backoff_base=1.0)
        ... def fetch_url(url: str) -> str:
        ...     response = requests.get(url)
        ...     return response.text
        >>> result = fetch_url("https://example.com")
    """
    if exceptions is None:
        try:
            from requests.exceptions import (
                RequestException, Timeout, ConnectionError, 
                HTTPError, SSLError
            )
            exceptions = (RequestException, Timeout, ConnectionError, HTTPError, SSLError)
        except ImportError:
            exceptions = (Exception,)
    
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_retries:
                        # Last attempt failed, raise exception
                        raise
                    
                    # Calculate backoff delay
                    delay = min(backoff_base * (2 ** attempt), backoff_max)
                    
                    # Add jitter if enabled
                    if jitter:
                        jitter_amount = random.uniform(0, delay * 0.1)
                        delay += jitter_amount
                    
                    # Wait before retrying
                    time.sleep(delay)
                    
                    # Log retry attempt (if logger available)
                    # logger.warning(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {str(e)}")
            
            # Should not reach here, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator

