"""Unit tests for onboarding service (Step 9.4)."""

from __future__ import annotations

from PySide6.QtCore import QSettings

from cuepoint.services.onboarding_service import OnboardingService


def test_onboarding_default_state_should_show(tmp_path):
    settings = QSettings(str(tmp_path / "onboarding.ini"), QSettings.IniFormat)
    service = OnboardingService(settings=settings)
    service.reset_onboarding()
    assert service.is_first_run() is True
    assert service.should_show_onboarding() is True


def test_onboarding_mark_complete_hides_onboarding(tmp_path):
    settings = QSettings(str(tmp_path / "onboarding.ini"), QSettings.IniFormat)
    service = OnboardingService(settings=settings)
    service.reset_onboarding()
    service.mark_first_run_complete(onboarding_version="1.0.0")
    assert service.is_first_run() is False
    assert service.should_show_onboarding() is False
    assert service.get_state().onboarding_version == "1.0.0"


def test_onboarding_dismiss_with_dont_show_again_sets_dismissed(tmp_path):
    settings = QSettings(str(tmp_path / "onboarding.ini"), QSettings.IniFormat)
    service = OnboardingService(settings=settings)
    service.reset_onboarding()
    service.dismiss_onboarding(dont_show_again=True)
    state = service.get_state()
    assert state.first_run_complete is True
    assert state.onboarding_dismissed is True
    assert service.should_show_onboarding() is False

