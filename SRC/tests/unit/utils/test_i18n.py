"""Unit tests for i18n manager utility."""

import pytest

from cuepoint.utils.i18n import I18nManager


class TestI18nManager:
    """Test i18n manager utility (no-op in v1.0)."""

    def test_setup_translations(self):
        """Test setup translations (no-op in v1.0)."""
        mock_app = None  # Not used in v1.0
        result = I18nManager.setup_translations(mock_app)
        assert result is True  # Always returns True in v1.0

    def test_tr_no_translation(self):
        """Test translation function (no-op in v1.0)."""
        text = "Hello World"
        result = I18nManager.tr(text)
        assert result == text  # Should return text as-is in v1.0

    def test_tr_with_context(self):
        """Test translation function with context (no-op in v1.0)."""
        text = "Hello World"
        result = I18nManager.tr(text, context="MainWindow")
        assert result == text  # Should return text as-is in v1.0

    def test_get_available_languages(self):
        """Test getting available languages (empty in v1.0)."""
        languages = I18nManager.get_available_languages()
        assert languages == []  # Empty list in v1.0

    def test_set_language(self):
        """Test setting language (no-op in v1.0)."""
        result = I18nManager.set_language("es")
        assert result is False  # Always returns False in v1.0

    def test_get_current_language(self):
        """Test getting current language (always 'en' in v1.0)."""
        language = I18nManager.get_current_language()
        assert language == "en"

    def test_instance_singleton(self):
        """Test that instance returns singleton."""
        instance1 = I18nManager.instance()
        instance2 = I18nManager.instance()
        assert instance1 is instance2
