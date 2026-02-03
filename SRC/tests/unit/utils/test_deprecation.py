#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for deprecation warnings (Step 12: Future-Proofing)."""

import warnings

import pytest

from cuepoint.utils.deprecation import (
    is_deprecated_cli_flag,
    is_deprecated_config,
    register_deprecated_cli_flag,
    register_deprecated_config,
    warn_deprecated_cli_flag,
    warn_deprecated_config,
)


@pytest.mark.unit
class TestDeprecationConfig:
    """Test config key deprecation."""

    def test_warn_deprecated_config_emits_warning(self):
        """Deprecated config key emits DeprecationWarning."""
        register_deprecated_config("OLD_KEY", "NEW_KEY", "v1.3.0")
        try:
            with pytest.warns(DeprecationWarning, match="OLD_KEY.*deprecated.*NEW_KEY"):
                warn_deprecated_config("OLD_KEY")
        finally:
            # Clean up - we'd need a unregister in production
            pass

    def test_warn_deprecated_config_unknown_key_no_warning(self):
        """Unknown config key does not warn."""
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            warn_deprecated_config("UNKNOWN_KEY")
            assert len(w) == 0

    def test_is_deprecated_config(self):
        """is_deprecated_config returns True for deprecated keys."""
        register_deprecated_config("DEPRECATED_X", "NEW_X", "v2.0")
        try:
            assert is_deprecated_config("DEPRECATED_X") is True
            assert is_deprecated_config("SOME_OTHER_KEY") is False
        finally:
            pass


@pytest.mark.unit
class TestDeprecationCliFlag:
    """Test CLI flag deprecation."""

    def test_warn_deprecated_cli_flag_emits_warning(self):
        """Deprecated CLI flag emits DeprecationWarning."""
        register_deprecated_cli_flag("--old-flag", "--new-flag", "v1.3.0")
        try:
            with pytest.warns(DeprecationWarning, match="--old-flag.*deprecated.*--new-flag"):
                warn_deprecated_cli_flag("--old-flag")
        finally:
            pass

    def test_warn_deprecated_cli_flag_unknown_no_warning(self):
        """Unknown CLI flag does not warn."""
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            warn_deprecated_cli_flag("--unknown")
            assert len(w) == 0

    def test_is_deprecated_cli_flag(self):
        """is_deprecated_cli_flag returns True for deprecated flags."""
        register_deprecated_cli_flag("--deprecated-f", "--new-f", "v2.0")
        try:
            assert is_deprecated_cli_flag("--deprecated-f") is True
            assert is_deprecated_cli_flag("--other") is False
        finally:
            pass
