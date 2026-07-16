"""Legacy Qt desktop UI package.

Phase 10 is migrating the shipped desktop app to Electron. This package remains
only for deprecated Qt UI code and transitional compatibility during removal.

New shared non-Qt types/helpers should live outside ``cuepoint.ui``.
Prefer:
- ``cuepoint.compat`` for extracted compatibility helpers
- ``apps/desktop-electron`` for the active desktop UI
"""
