#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Internationalization Hooks (Localization-Ready)

Step 9.3 (v1.0) goal:
- Ship English-only, but make localization possible without rewriting UI code.

This module provides:
- `tr(key, default, context=...)` translation hook (Qt-compatible)
- Optional QTranslator loading for future `.qm` files

Behavior today:
- If no translators are installed, `tr(...)` returns the English default.
"""

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from PySide6.QtCore import QCoreApplication, QLocale, QTranslator

    _QT_AVAILABLE = True
except Exception:  # pragma: no cover - PySide6 may be absent in some environments
    QCoreApplication = None  # type: ignore
    QLocale = None  # type: ignore
    QTranslator = None  # type: ignore
    _QT_AVAILABLE = False


class I18nManager:
    """Internationalization manager.

    In v1.0, this class provides translation hooks and optional QTranslator
    loading. The shipped default remains English, but the code is structured so
    that adding translations later is primarily a build/config task.

    Future (v1.1+):
    - Add language selection UI in Settings
    - Bundle `.qm` translation files in installers
    """

    _instance: Optional["I18nManager"] = None

    def __init__(self):
        """Initialize i18n manager."""
        self._language_code = "en"
        self._translator: Optional["QTranslator"] = None
        # Default translations directory (repo root / translations)
        # This file is at: SRC/cuepoint/utils/i18n.py → repo root is 3 parents up.
        self._translations_dir = Path(__file__).resolve().parents[3] / "translations"

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
        """Setup translations for the application (safe no-op if none exist).

        Args:
            app: QApplication instance (optional; used to install QTranslator).

        Returns:
            bool: True if setup succeeded (even if no translations are present).
        """
        if not _QT_AVAILABLE or app is None:
            logger.debug("setup_translations called without Qt/app; using English defaults")
            return True

        # Best-effort: attempt to load translations for the system locale.
        try:
            locale_name = QLocale.system().name()  # e.g. "en_US"
            if I18nManager.set_language(locale_name, app=app):
                return True
            return I18nManager.set_language(locale_name.split("_")[0], app=app)
        except Exception as e:
            logger.debug(f"Translation setup skipped: {e}")
            return True
        return True

    @staticmethod
    def tr(text: str, context: Optional[str] = None) -> str:
        """Translate a user-visible string.

        This method is intentionally conservative for v1.0:
        - If no translator is installed, returns `text`.
        - If a translator is installed, delegates to Qt translation system.

        Args:
            text: Text to translate.
            context: Qt translation context (recommended: module/widget name).

        Returns:
            str: Translated text if available, otherwise original text.
        """
        if not _QT_AVAILABLE or QCoreApplication is None:
            return text

        ctx = context or "CuePoint"
        try:
            translated = QCoreApplication.translate(ctx, text)
            return translated or text
        except Exception:
            return text

    @staticmethod
    def tr_key(key: str, default: str, context: str = "CuePoint") -> str:
        """Translate using a stable key + English default."""
        # Use the key as part of the context so translators can group strings by feature.
        return I18nManager.tr(default, context=f"{context}:{key}")

    @staticmethod
    def get_available_languages() -> list[str]:
        """Get list of available languages based on bundled `.qm` files."""
        mgr = I18nManager.instance()
        translations_dir = mgr._translations_dir
        if not translations_dir.exists():
            return []

        langs: set[str] = set()
        for qm in translations_dir.glob("cuepoint_*.qm"):
            parts = qm.stem.split("_", 1)
            if len(parts) == 2 and parts[1]:
                langs.add(parts[1])
        return sorted(langs)

    @staticmethod
    def set_language(language_code: str, *, app=None) -> bool:
        """Set application language by installing a QTranslator if available.

        Args:
            language_code: Language code (e.g., 'en', 'es', 'fr').
            app: QApplication instance (needed to install the translator).

        Returns:
            bool: True if the translator was loaded/installed, False otherwise.
        """
        mgr = I18nManager.instance()
        mgr._language_code = language_code or "en"

        if not _QT_AVAILABLE or app is None or QTranslator is None:
            return False

        translations_dir = mgr._translations_dir
        if not translations_dir.exists():
            return False

        qm_path = translations_dir / f"cuepoint_{language_code}.qm"
        if not qm_path.exists():
            return False

        try:
            translator = QTranslator()
            if not translator.load(str(qm_path)):
                return False

            if mgr._translator is not None:
                try:
                    app.removeTranslator(mgr._translator)
                except Exception:
                    pass
            app.installTranslator(translator)
            mgr._translator = translator
            return True
        except Exception:
            return False

    @staticmethod
    def get_current_language() -> str:
        """Get current language code."""
        return I18nManager.instance()._language_code


def tr(key: str, default: str, context: str = "CuePoint") -> str:
    """Module-level translation hook used throughout UI code."""
    return I18nManager.tr_key(key=key, default=default, context=context)
