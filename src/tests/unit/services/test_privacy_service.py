"""Unit tests for privacy service (Step 8.4).

Privacy preferences persist through ConfigService (``privacy.*``), with no
GUI-toolkit dependency.
"""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from cuepoint.services.config_service import ConfigService
from cuepoint.services.interfaces import IConfigService, IPrivacyService
from cuepoint.services.privacy_service import PrivacyPreferences, PrivacyService


@pytest.fixture
def config_service(tmp_path) -> ConfigService:
    """A real ConfigService backed by a temp file (never the user's config)."""
    return ConfigService(config_file=tmp_path / "config.yaml")


def test_privacy_implements_interface():
    assert issubclass(PrivacyService, IPrivacyService)


def test_privacy_defaults_are_off(config_service):
    prefs = PrivacyService(config_service=config_service).get_preferences()
    assert prefs.clear_cache_on_exit is False
    assert prefs.clear_logs_on_exit is False


def test_privacy_set_preferences_round_trip(config_service):
    service = PrivacyService(config_service=config_service)
    service.set_preferences(
        PrivacyPreferences(clear_cache_on_exit=True, clear_logs_on_exit=True)
    )

    prefs = service.get_preferences()
    assert prefs.clear_cache_on_exit is True
    assert prefs.clear_logs_on_exit is True


def test_privacy_preferences_persist_across_instances(config_service):
    """Preferences survive a fresh ConfigService load from the same file."""
    PrivacyService(config_service=config_service).set_clear_cache_on_exit(True)

    reloaded = ConfigService(config_file=config_service.config_file)
    prefs = PrivacyService(config_service=reloaded).get_preferences()

    assert prefs.clear_cache_on_exit is True
    assert prefs.clear_logs_on_exit is False


def test_privacy_setters_do_not_clobber_each_other(config_service):
    service = PrivacyService(config_service=config_service)
    service.set_clear_cache_on_exit(True)
    service.set_clear_logs_on_exit(True)

    prefs = service.get_preferences()
    assert prefs.clear_cache_on_exit is True, "cache pref lost when setting logs pref"
    assert prefs.clear_logs_on_exit is True

    service.set_clear_logs_on_exit(False)
    prefs = service.get_preferences()
    assert prefs.clear_cache_on_exit is True
    assert prefs.clear_logs_on_exit is False


def test_privacy_uses_expected_config_keys():
    config_service = Mock(spec=IConfigService)
    config_service.get.return_value = False

    service = PrivacyService(config_service=config_service)
    service.set_preferences(
        PrivacyPreferences(clear_cache_on_exit=True, clear_logs_on_exit=False)
    )

    config_service.set.assert_any_call("privacy.clear_cache_on_exit", True)
    config_service.set.assert_any_call("privacy.clear_logs_on_exit", False)
    config_service.save.assert_called_once()


def test_privacy_save_failure_propagates():
    """A toggled preference is never silently lost."""
    config_service = Mock(spec=IConfigService)
    config_service.get.return_value = False
    config_service.save.side_effect = OSError("read-only filesystem")

    service = PrivacyService(config_service=config_service)
    with pytest.raises(OSError):
        service.set_clear_cache_on_exit(True)


def test_apply_exit_policies_runs_enabled_actions(config_service):
    service = PrivacyService(config_service=config_service)
    service.set_preferences(
        PrivacyPreferences(clear_cache_on_exit=True, clear_logs_on_exit=True)
    )

    with patch("cuepoint.services.privacy_service.DataDeletionManager") as mock_manager:
        service.apply_exit_policies()

    mock_manager.clear_cache.assert_called_once()
    mock_manager.clear_logs.assert_called_once()


def test_apply_exit_policies_skips_disabled_actions(config_service):
    service = PrivacyService(config_service=config_service)
    service.set_preferences(
        PrivacyPreferences(clear_cache_on_exit=True, clear_logs_on_exit=False)
    )

    with patch("cuepoint.services.privacy_service.DataDeletionManager") as mock_manager:
        service.apply_exit_policies()

    mock_manager.clear_cache.assert_called_once()
    mock_manager.clear_logs.assert_not_called()


def test_apply_exit_policies_never_raises(config_service):
    """Exit policies must never block application shutdown."""
    service = PrivacyService(config_service=config_service)
    service.set_clear_cache_on_exit(True)

    with patch("cuepoint.services.privacy_service.DataDeletionManager") as mock_manager:
        mock_manager.clear_cache.side_effect = RuntimeError("boom")
        service.apply_exit_policies()  # must not raise
