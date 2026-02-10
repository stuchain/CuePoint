#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compatibility shim for legacy imports.

Some tests and older code refer to a top-level `beatport` module.
The canonical implementation lives at `cuepoint.data.beatport`.
"""

from cuepoint.data.beatport import *  # noqa: F403
