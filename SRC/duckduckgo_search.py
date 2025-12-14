#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compatibility shim for DuckDuckGo search.

The project uses the `ddgs` package in v1.0. Some historical code/tests refer
to `duckduckgo_search.DDGS`. This module bridges that gap by re-exporting DDGS.
"""

from __future__ import annotations

try:
    from ddgs import DDGS  # type: ignore
except Exception as e:  # pragma: no cover
    # Provide a minimal stub so imports don't crash in environments without ddgs.
    class DDGS:  # type: ignore
        def __init__(self, *args, **kwargs):
            raise ImportError("ddgs dependency is required for DuckDuckGo search") from e


