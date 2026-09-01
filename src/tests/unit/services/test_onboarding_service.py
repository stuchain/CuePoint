"""Unit tests for onboarding service (Step 9.4).

Onboarding state persists through ConfigService (``product.onboarding_*``),
with no GUI-toolkit dependency, so these tests run in the default (Qt-free)
environment.
"""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from cuepoint.services.config_service import ConfigService
from cuepoint.services.interfaces import IConfigService, IOnboardingService
from cuepoint.services.onboarding_service import OnboardingService


@pytest.fixture
def config_service(tmp_path) -> ConfigService:
    """A real ConfigService backed by a temp file (never the user's config)."""
    return ConfigService(config_file=tmp_path / "config.yaml")


def test_onboarding_implements_interface():
    assert issubclass(OnboardingService, IOnboardingService)


def test_onboarding_default_state_should_show(config_service):
    service = OnboardingService(config_service=config_service)
    service.reset_onboarding()
    assert service.is_first_run() is True
    assert service.should_show_onboarding() is True


def test_onboarding_mark_complete_hides_onboarding(config_service):
    service = OnboardingService(config_service=config_service)
    service.reset_onboarding()
    service.mark_first_run_complete(onboarding_version="1.0.0")
    assert service.is_first_run() is False
    assert service.should_show_onboarding() is False
    assert service.get_state().onboarding_version == "1.0.0"


def test_onboarding_dismiss_with_dont_show_again_sets_dismissed(config_service):
    service = OnboardingService(config_service=config_service)
    service.reset_onboarding()
    service.dismiss_onboarding(dont_show_again=True)
    state = service.get_state()
    assert state.first_run_complete is True
    assert state.onboarding_dismissed is True
    assert service.should_show_onboarding() is False


def test_onboarding_uses_config_service_keys():
    config_service = Mock(spec=IConfigService)
    config_service.get.side_effect = lambda key, default=None: {
        "product.onboarding_seen": False,
        "product.onboarding_dismissed": False,
        "product.onboarding_version": None,
    }.get(key, default)

    service = OnboardingService(config_service=config_service)
    service.mark_first_run_complete(onboarding_version="1.2.3")

    config_service.set.assert_any_call("product.onboarding_seen", True)
    config_service.set.assert_any_call("product.onboarding_dismissed", False)
    config_service.set.assert_any_call("product.onboarding_version", "1.2.3")
    config_service.save.assert_called_once()


def test_onboarding_state_persists_across_service_instances(config_service):
    """State written by one instance is visible to a new one (real round-trip)."""
    OnboardingService(config_service=config_service).mark_first_run_complete(
        onboarding_version="9.9.9"
    )

    reloaded = ConfigService(config_file=config_service.config_file)
    service = OnboardingService(config_service=reloaded)

    state = service.get_state()
    assert state.first_run_complete is True
    assert state.onboarding_version == "9.9.9"
    assert service.should_show_onboarding() is False


def test_onboarding_reset_restores_first_run(config_service):
    service = OnboardingService(config_service=config_service)
    service.mark_first_run_complete(onboarding_version="1.0.0")
    service.reset_onboarding()

    state = service.get_state()
    assert state.first_run_complete is False
    assert state.onboarding_dismissed is False
    assert state.onboarding_version is None
    assert service.should_show_onboarding() is True


def test_onboarding_dismiss_without_dont_show_again_keeps_dismissed_false(
    config_service,
):
    service = OnboardingService(config_service=config_service)
    service.reset_onboarding()
    service.dismiss_onboarding(dont_show_again=False)

    state = service.get_state()
    assert state.first_run_complete is True
    assert state.onboarding_dismissed is False
    # first_run_complete alone is enough to stop showing onboarding
    assert service.should_show_onboarding() is False


def test_onboarding_save_failure_propagates():
    """Persistence failures are surfaced, not silently swallowed."""
    config_service = Mock(spec=IConfigService)
    config_service.get.return_value = False
    config_service.save.side_effect = OSError("disk full")

    service = OnboardingService(config_service=config_service)
    with pytest.raises(OSError):
        service.mark_first_run_complete(onboarding_version="1.0.0")
