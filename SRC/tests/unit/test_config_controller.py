#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Unit tests for ConfigController
"""

import pytest
from unittest.mock import Mock
from cuepoint.ui.controllers.config_controller import ConfigController
from cuepoint.services.interfaces import IConfigService


@pytest.fixture
def mock_config_service():
    """Create a mock config service"""
    service = Mock(spec=IConfigService)
    service.get = Mock(return_value=None)
    service.set = Mock()
    service.save = Mock()
    return service


@pytest.fixture
def controller():
    """Create a ConfigController instance"""
    return ConfigController()


@pytest.fixture
def controller_with_service(mock_config_service):
    """Create a ConfigController with mock service"""
    return ConfigController(config_service=mock_config_service)


def test_get_preset_values_balanced(controller):
    """Test getting balanced preset values"""
    values = controller.get_preset_values("balanced")
    assert values["TRACK_WORKERS"] == 12
    assert values["PER_TRACK_TIME_BUDGET_SEC"] == 45
    assert values["MIN_ACCEPT_SCORE"] == 70.0
    assert values["MAX_SEARCH_RESULTS"] == 50


def test_get_preset_values_fast(controller):
    """Test getting fast preset values"""
    values = controller.get_preset_values("fast")
    assert values["TRACK_WORKERS"] == 8
    assert values["PER_TRACK_TIME_BUDGET_SEC"] == 30
    assert values["MIN_ACCEPT_SCORE"] == 75.0
    assert values["MAX_SEARCH_RESULTS"] == 40


def test_get_preset_values_turbo(controller):
    """Test getting turbo preset values"""
    values = controller.get_preset_values("turbo")
    assert values["TRACK_WORKERS"] == 16
    assert values["PER_TRACK_TIME_BUDGET_SEC"] == 20
    assert values["MIN_ACCEPT_SCORE"] == 80.0
    assert values["MAX_SEARCH_RESULTS"] == 30


def test_get_preset_values_exhaustive(controller):
    """Test getting exhaustive preset values"""
    values = controller.get_preset_values("exhaustive")
    assert values["TRACK_WORKERS"] == 6
    assert values["PER_TRACK_TIME_BUDGET_SEC"] == 120
    assert values["MIN_ACCEPT_SCORE"] == 60.0
    assert values["MAX_SEARCH_RESULTS"] == 100


def test_get_preset_values_invalid(controller):
    """Test getting invalid preset returns balanced"""
    values = controller.get_preset_values("invalid")
    assert values["TRACK_WORKERS"] == 12  # Default balanced values


def test_validate_settings_valid(controller):
    """Test validation of valid settings"""
    settings = {
        "TRACK_WORKERS": 10,
        "PER_TRACK_TIME_BUDGET_SEC": 50,
        "MIN_ACCEPT_SCORE": 75.0,
        "MAX_SEARCH_RESULTS": 60
    }
    is_valid, error = controller.validate_settings(settings)
    assert is_valid is True
    assert error is None


def test_validate_settings_invalid_workers(controller):
    """Test validation with invalid TRACK_WORKERS"""
    settings = {
        "TRACK_WORKERS": 25,  # Too high
        "PER_TRACK_TIME_BUDGET_SEC": 50,
        "MIN_ACCEPT_SCORE": 75.0,
        "MAX_SEARCH_RESULTS": 60
    }
    is_valid, error = controller.validate_settings(settings)
    assert is_valid is False
    assert error is not None


def test_validate_settings_invalid_time_budget(controller):
    """Test validation with invalid PER_TRACK_TIME_BUDGET_SEC"""
    settings = {
        "TRACK_WORKERS": 10,
        "PER_TRACK_TIME_BUDGET_SEC": 5,  # Too low
        "MIN_ACCEPT_SCORE": 75.0,
        "MAX_SEARCH_RESULTS": 60
    }
    is_valid, error = controller.validate_settings(settings)
    assert is_valid is False
    assert error is not None


def test_merge_settings_with_preset(controller):
    """Test merging preset with custom settings"""
    custom = {"TRACK_WORKERS": 15}
    merged = controller.merge_settings_with_preset("balanced", custom)
    assert merged["TRACK_WORKERS"] == 15  # Custom overrides preset
    assert merged["PER_TRACK_TIME_BUDGET_SEC"] == 45  # From preset


def test_get_default_settings(controller):
    """Test getting default settings"""
    defaults = controller.get_default_settings()
    assert defaults["TRACK_WORKERS"] == 12
    assert defaults["PER_TRACK_TIME_BUDGET_SEC"] == 45


def test_apply_preset_to_settings(controller):
    """Test applying preset to existing settings"""
    current = {
        "TRACK_WORKERS": 10,
        "PER_TRACK_TIME_BUDGET_SEC": 30,
        "MIN_ACCEPT_SCORE": 80.0,
        "MAX_SEARCH_RESULTS": 50,
        "OTHER_SETTING": "value"  # Should be preserved
    }
    updated = controller.apply_preset_to_settings("fast", current)
    assert updated["TRACK_WORKERS"] == 8  # From preset
    assert updated["PER_TRACK_TIME_BUDGET_SEC"] == 30  # From preset
    assert updated["OTHER_SETTING"] == "value"  # Preserved


def test_get_config_value(controller_with_service, mock_config_service):
    """Test getting config value from service"""
    mock_config_service.get.return_value = "test_value"
    value = controller_with_service.get_config_value("test_key", "default")
    assert value == "test_value"
    mock_config_service.get.assert_called_once_with("test_key", "default")


def test_set_config_value(controller_with_service, mock_config_service):
    """Test setting config value in service"""
    controller_with_service.set_config_value("test_key", "test_value")
    mock_config_service.set.assert_called_once_with("test_key", "test_value")
    mock_config_service.save.assert_called_once()













