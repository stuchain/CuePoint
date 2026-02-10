#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Deprecation warnings for config keys and CLI flags (Step 12: Future-Proofing).

When a config key or CLI flag is deprecated, add it here. Warnings are emitted
when deprecated features are used. See docs/policy/deprecation-schedule.md.
"""

import warnings

# Deprecated config keys: key -> (replacement, removal_version)
# Example: "OLD_KEY": ("NEW_KEY", "v1.3.0")
_DEPRECATED_CONFIG_KEYS: dict[str, tuple[str, str]] = {}

# Deprecated CLI flags: flag_name -> (replacement, removal_version)
# Example: "--old-flag": ("--new-flag", "v1.3.0")
_DEPRECATED_CLI_FLAGS: dict[str, tuple[str, str]] = {}


def warn_deprecated_config(key: str) -> None:
    """Warn if config key is deprecated.

    Args:
        key: Config key being used (e.g., "OLD_KEY" or "old.section.key").
    """
    info = _DEPRECATED_CONFIG_KEYS.get(key)
    if not info:
        return
    replacement, removal = info
    warnings.warn(
        f"Config key '{key}' is deprecated. Use '{replacement}' instead. "
        f"'{key}' will be removed in {removal}. See docs/policy/deprecation-schedule.md.",
        DeprecationWarning,
        stacklevel=2,
    )


def warn_deprecated_cli_flag(flag: str) -> None:
    """Warn if CLI flag is deprecated.

    Args:
        flag: CLI flag being used (e.g., "--old-flag").
    """
    info = _DEPRECATED_CLI_FLAGS.get(flag)
    if not info:
        return
    replacement, removal = info
    warnings.warn(
        f"CLI flag '{flag}' is deprecated. Use '{replacement}' instead. "
        f"'{flag}' will be removed in {removal}. See docs/policy/deprecation-schedule.md.",
        DeprecationWarning,
        stacklevel=2,
    )


def is_deprecated_config(key: str) -> bool:
    """Check if config key is deprecated."""
    return key in _DEPRECATED_CONFIG_KEYS


def is_deprecated_cli_flag(flag: str) -> bool:
    """Check if CLI flag is deprecated."""
    return flag in _DEPRECATED_CLI_FLAGS


def register_deprecated_config(key: str, replacement: str, removal: str) -> None:
    """Register a deprecated config key (for tests or internal use).

    Args:
        key: Deprecated key.
        replacement: Replacement key to use.
        removal: Version when key will be removed.
    """
    _DEPRECATED_CONFIG_KEYS[key] = (replacement, removal)


def register_deprecated_cli_flag(flag: str, replacement: str, removal: str) -> None:
    """Register a deprecated CLI flag (for tests or internal use).

    Args:
        flag: Deprecated flag.
        replacement: Replacement flag to use.
        removal: Version when flag will be removed.
    """
    _DEPRECATED_CLI_FLAGS[flag] = (replacement, removal)
