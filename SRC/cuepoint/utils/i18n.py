#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Internationalization Hooks (Prepared for Future Use)

Provides i18n hooks for future localization support.
In v1.0, this module provides no-op functions.
Implements out-of-scope documentation from Step 1.12.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class I18nManager:
    """Internationalization manager (prepared for v1.1+).

    In v1.0, this class provides no-op functions to prepare for future
    localization. All strings remain hardcoded in English.

    Future (v1.1+):
    - Use Qt translation system (QTranslator)
    - Load translation files (.ts/.qm)
    - Implement language selection UI
    """

    _instance: Optional["I18nManager"] = None

    def __init__(self):
        """Initialize i18n manager (no-op in v1.0)."""
        # In v1.0, do nothing
        # In v1.1+, initialize QTranslator
        pass

    @classmethod
    def instance(cls) -> "I18nManager":
        """Get singleton instance.

        Returns:
            I18nManager instance.
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def setup_translations(app) -> bool:
        """Setup translations (not used in v1.0).

        Args:
            app: QApplication instance (unused in v1.0).

        Returns:
            bool: Always True in v1.0 (no-op).

        Future (v1.1+):
            - Load translation files (.ts/.qm)
            - Set application locale
            - Return True if translations loaded successfully
        """
        # In v1.0, just log that this was called
        logger.debug("setup_translations called (no-op in v1.0)")
        return True

    @staticmethod
    def tr(text: str, context: Optional[str] = None) -> str:
        """Translation function (no-op in v1.0).

        Args:
            text: Text to translate.
            context: Translation context (optional, unused in v1.0).

        Returns:
            str: Original text (no translation in v1.0).

        Future (v1.1+):
            - Use QTranslator to translate text
            - Return translated text if available
            - Fall back to original if translation missing
        """
        # In v1.0, just return text as-is
        return text

    @staticmethod
    def get_available_languages() -> list[str]:
        """Get list of available languages (empty in v1.0).

        Returns:
            list[str]: Empty list in v1.0.

        Future (v1.1+):
            - Scan for .qm files
            - Return list of available language codes
        """
        return []

    @staticmethod
    def set_language(language_code: str) -> bool:
        """Set application language (no-op in v1.0).

        Args:
            language_code: Language code (e.g., 'en', 'es', 'fr').

        Returns:
            bool: Always False in v1.0 (not supported).

        Future (v1.1+):
            - Load translation file for language
            - Update all UI strings
            - Return True if language set successfully
        """
        logger.debug(f"set_language called with {language_code} (no-op in v1.0)")
        return False

    @staticmethod
    def get_current_language() -> str:
        """Get current language (always 'en' in v1.0).

        Returns:
            str: Always 'en' in v1.0.
        """
        return "en"
