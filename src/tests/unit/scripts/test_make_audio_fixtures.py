"""The audio fixture script (PLAYER-01, WAVE-01).

The fixtures are committed; these tests hold the script that makes them to
what it says, and the committed analysis fixture to what the checks assume.
"""

from __future__ import annotations

import importlib.util
import sys
import wave
from array import array
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_REPO = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO / "scripts" / "make_audio_fixtures.py"


def _load():
    spec = importlib.util.spec_from_file_location("make_audio_fixtures", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


maf = _load()


def _crossings_per_second(samples: "array[int]", rate: int) -> float:
    crossings = sum(
        1 for a, b in zip(samples, samples[1:]) if (a < 0 <= b) or (b < 0 <= a)
    )
    return crossings * rate / len(samples)


class TestBandsWav:
    @pytest.fixture(scope="class")
    def samples(self, tmp_path_factory) -> "array[int]":
        path = tmp_path_factory.mktemp("bands") / "bands.wav"
        maf.write_bands_wav(path)
        with wave.open(str(path), "rb") as wav:
            assert wav.getnchannels() == 1
            assert wav.getsampwidth() == 2
            assert wav.getframerate() == maf.BANDS_RATE
            data = array("h")
            data.frombytes(wav.readframes(wav.getnframes()))
        return data

    def test_it_is_six_seconds(self, samples):
        assert len(samples) == maf.BANDS_RATE * maf.BANDS_SECTION_SECONDS * 3

    @pytest.mark.parametrize("index", [0, 1, 2])
    def test_each_section_is_its_tone(self, samples, index):
        """A tone crosses zero twice a cycle."""
        section = maf.BANDS_RATE * maf.BANDS_SECTION_SECONDS
        part = samples[index * section : (index + 1) * section]
        frequency = maf.BANDS_TONES_HZ[index]
        assert _crossings_per_second(part, maf.BANDS_RATE) == pytest.approx(
            2 * frequency, rel=0.01
        )

    def test_one_tone_sits_inside_each_band(self):
        """Low below 200 Hz, mid between, high above 2 kHz (DEC-117)."""
        low, mid, high = maf.BANDS_TONES_HZ
        assert low < 200 < mid < 2000 < high < maf.BANDS_RATE / 2


class TestCommittedFixture:
    def test_the_analysis_fixture_is_listed_and_small(self):
        path = maf.FIXTURE_DIR / "bands.flac"
        assert path in maf.expected_files()
        assert 0 < path.stat().st_size < 100_000

    def test_it_is_mono_flac_at_the_bands_rate(self):
        import mutagen

        info = mutagen.File(maf.FIXTURE_DIR / "bands.flac").info
        assert info.channels == 1
        assert info.sample_rate == maf.BANDS_RATE
        # Encode mode pads to a frame boundary: never shorter, a little longer.
        assert 6.0 <= info.length < 6.2


class TestResolveMpv:
    def test_a_named_mpv_comes_first(self, tmp_path, monkeypatch):
        named = tmp_path / "mpv"
        named.write_bytes(b"x")
        monkeypatch.setenv("CUEPOINT_MPV_PATH", str(tmp_path / "other"))
        assert maf.resolve_mpv(str(named)) == named

    def test_the_environment_is_next(self, tmp_path, monkeypatch):
        named = tmp_path / "mpv"
        named.write_bytes(b"x")
        monkeypatch.setenv("CUEPOINT_MPV_PATH", str(named))
        assert maf.resolve_mpv(None) == named

    def test_a_named_mpv_that_is_not_there_stops(self, tmp_path):
        with pytest.raises(SystemExit, match="No mpv"):
            maf.resolve_mpv(str(tmp_path / "nope"))

    def test_check_lists_every_fixture(self, capsys):
        assert maf.main(["--check"]) == 0
        out = capsys.readouterr().out
        assert "bands.flac" in out and "tone.mp3" in out
