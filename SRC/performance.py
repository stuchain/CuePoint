#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Compatibility shim for performance tracking.

Some modules/tests import `performance.performance_collector` as a legacy path.
The actual implementation lives in `cuepoint.utils.performance`.
"""

from __future__ import annotations

from cuepoint.utils.performance import performance_collector


