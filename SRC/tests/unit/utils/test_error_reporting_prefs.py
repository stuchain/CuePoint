#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Error Reporting Preferences

Tests user preference management for error reporting.
"""

from unittest.mock import Mock, MagicMock, patch

import pytest

from cuepoint.utils.error_reporting_prefs import ErrorReportingPrefs


class TestErrorReportingPrefs:
    """Test ErrorReportingPrefs class."""
    
    @pytest.fixture
    def mock_settings(self):
        """Create mock QSettings."""
        settings = MagicMock()
        settings.value = Mock(return_value=False)
        return settings
    
    @pytest.fixture
    def prefs(self, mock_settings):
        """Create ErrorReportingPrefs instance with mocked settings."""
        with patch('cuepoint.utils.error_reporting_prefs.QSettings', return_value=mock_settings):
            return ErrorReportingPrefs()
    
    def test_is_enabled_default(self, prefs, mock_settings):
        """Test is_enabled returns default value."""
        mock_settings.value.return_value = True
        assert prefs.is_enabled() is True
        
        mock_settings.value.assert_called_with("error_reporting/enabled", True, type=bool)
    
    def test_set_enabled(self, prefs, mock_settings):
        """Test set_enabled saves preference."""
        prefs.set_enabled(False)
        
        mock_settings.setValue.assert_called_with("error_reporting/enabled", False)
    
    def test_has_user_consented_default(self, prefs, mock_settings):
        """Test has_user_consented returns default value."""
        mock_settings.value.return_value = False
        assert prefs.has_user_consented() is False
        
        mock_settings.value.assert_called_with("error_reporting/consented", False, type=bool)
    
    def test_set_consented(self, prefs, mock_settings):
        """Test set_consented saves preference."""
        prefs.set_consented(True)
        
        mock_settings.setValue.assert_called_with("error_reporting/consented", True)

