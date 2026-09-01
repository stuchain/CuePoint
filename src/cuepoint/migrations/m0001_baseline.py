#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Baseline migration: establishes version 1 on an empty database.

Deliberately creates no tables. Its job is to mark the point from which the
schema is managed by migrations, so the very first migration to create real
tables is an ordinary increment rather than a special case.

The library tables themselves arrive with the persistent Track model.
"""

from __future__ import annotations

VERSION = 1

DESCRIPTION = "baseline (no schema)"

SQL = ""
