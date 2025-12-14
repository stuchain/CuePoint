#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Test fixture utilities and helpers.

Provides convenient functions for loading test fixtures in tests.
"""

from pathlib import Path
from typing import Optional

# Base fixture directory
FIXTURE_DIR = Path(__file__).parent


def get_fixture_path(relative_path: str) -> Path:
    """Get absolute path to a fixture file.
    
    Args:
        relative_path: Path relative to fixtures directory (e.g., "rekordbox/minimal.xml")
        
    Returns:
        Absolute path to fixture file.
        
    Raises:
        FileNotFoundError: If fixture file doesn't exist.
    """
    fixture_path = FIXTURE_DIR / relative_path
    if not fixture_path.exists():
        raise FileNotFoundError(
            f"Fixture not found: {relative_path}\n"
            f"Expected at: {fixture_path}"
        )
    return fixture_path


def load_fixture(relative_path: str, encoding: str = "utf-8") -> str:
    """Load fixture file as text.
    
    Args:
        relative_path: Path relative to fixtures directory
        encoding: Text encoding (default: utf-8)
        
    Returns:
        File contents as string.
    """
    fixture_path = get_fixture_path(relative_path)
    return fixture_path.read_text(encoding=encoding)


def load_fixture_bytes(relative_path: str) -> bytes:
    """Load fixture file as bytes.
    
    Args:
        relative_path: Path relative to fixtures directory
        
    Returns:
        File contents as bytes.
    """
    fixture_path = get_fixture_path(relative_path)
    return fixture_path.read_bytes()


# Convenience functions for common fixtures
def get_rekordbox_fixture(name: str) -> Path:
    """Get path to Rekordbox XML fixture.
    
    Args:
        name: Fixture name (e.g., "minimal", "single_playlist")
        
    Returns:
        Path to fixture file.
    """
    return get_fixture_path(f"rekordbox/{name}.xml")


def get_beatport_fixture(name: str) -> Path:
    """Get path to Beatport HTML fixture.
    
    Args:
        name: Fixture name (e.g., "search_results_standard")
        
    Returns:
        Path to fixture file.
    """
    return get_fixture_path(f"beatport/{name}.html")


def get_export_fixture(name: str, format: str = "csv") -> Path:
    """Get path to export golden file.
    
    Args:
        name: Fixture name (e.g., "minimal_export")
        format: Export format (csv, json)
        
    Returns:
        Path to fixture file.
    """
    return get_fixture_path(f"exports/{format}/{name}.{format}")


