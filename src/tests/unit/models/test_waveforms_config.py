#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The waveform analysis's one setting in the config tree (WAVE-03, DEC-116).

Pause persists across a restart because it is a key of ``config.yaml``, so it
must survive a full ``to_dict``/``from_dict`` round trip and a save and load,
and a config written before WAVE-03 must load as not paused.
"""

from __future__ import annotations

import pytest

from cuepoint.models.config_models import AppConfig, WaveformsConfig
from cuepoint.services.config_service import ConfigService


@pytest.mark.unit
class TestWaveformsConfig:
    def test_not_paused_by_default(self):
        assert WaveformsConfig().analysis_paused is False
        assert AppConfig.default().to_dict()["waveforms"] == {"analysis_paused": False}

    def test_a_config_from_before_the_setting_loads_as_not_paused(self):
        assert AppConfig.from_dict({"privacy": {}}).waveforms.analysis_paused is False

    def test_an_empty_section_loads_as_not_paused(self):
        assert (
            AppConfig.from_dict({"waveforms": None}).waveforms.analysis_paused is False
        )

    def test_round_trip(self):
        original = AppConfig.default()
        original.waveforms.analysis_paused = True

        assert AppConfig.from_dict(original.to_dict()).waveforms.analysis_paused

    def test_saved_and_read_back_by_a_new_service(self, tmp_path):
        path = tmp_path / "config.yaml"
        first = ConfigService(config_file=path)
        first.set("waveforms.analysis_paused", True)
        first.save()

        assert ConfigService(config_file=path).get("waveforms.analysis_paused") is True
