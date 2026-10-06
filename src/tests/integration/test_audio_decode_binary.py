"""The waveform decoder against a real mpv (WAVE-01, DEC-123).

The unit tests prove what the module decides from what a decoder says. These
prove what a real decoder says: that the pipeline gives every shipped format
its exact length, that each band is where it is named, and that each broken
file is told apart from a broken decoder.

Which mpv:

1. the bundled sidecar, when it has been fetched (desktop CI fetches it on
   Windows and macOS, so these run against the pinned builds there);
2. ``CUEPOINT_MPV_PATH``, as the app honours it;
3. an ``mpv`` on the ``PATH``, so a Linux contributor with the distribution's
   build runs them too.

Every test skips when there is none.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

import mutagen
import pytest

from cuepoint.data import audio_decode as ad

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO / "src" / "tests" / "fixtures" / "audio"
_SCRIPT = _REPO / "scripts" / "fetch_player_sidecar.py"

FORMAT_FIXTURES = ("tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3")
TONAL = {"tone.wav", "tone.flac", "tone.aiff", "tone.m4a"}


def _load_fetch_script():
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


fps = _load_fetch_script()


def _bundled() -> Optional[Path]:
    manifest = fps.load_manifest()
    target = manifest.targets.get(fps.host_target_key())
    if target is None or not target.supported:
        return None
    path = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    return path if path.exists() else None


@pytest.fixture(scope="module")
def decoder() -> Path:
    for candidate in (
        _bundled(),
        os.environ.get("CUEPOINT_MPV_PATH"),
        shutil.which("mpv"),
    ):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    pytest.skip(
        "no mpv: run `python scripts/fetch_player_sidecar.py`, or set CUEPOINT_MPV_PATH"
    )


def _length_samples(path: Path) -> float:
    """The file's own length, as its container states it, in envelope samples."""
    audio = mutagen.File(path)
    assert audio is not None, f"mutagen cannot read {path.name}"
    return float(audio.info.length) * ad.ENVELOPE_RATE_HZ


def _section_peaks(envelope: ad.Envelope, index: int, sections: int = 3):
    count = envelope.frames
    start = index * count // sections + 15
    end = (index + 1) * count // sections - 15
    return {band: max(envelope.band(band)[start:end]) for band in ad.BANDS}


class TestEveryFormat:
    @pytest.mark.parametrize("transport", ad.platform_transports())
    @pytest.mark.parametrize("name", FORMAT_FIXTURES)
    def test_its_envelope_is_its_own_length(self, decoder, name, transport):
        """Within one envelope sample of the container: nothing padded or cut."""
        source = _FIXTURES / name
        envelope = ad.decode_envelope(source.resolve(), decoder, transport=transport)
        assert abs(envelope.frames - _length_samples(source)) <= 1
        assert envelope.rate_hz == ad.ENVELOPE_RATE_HZ
        assert {len(envelope.band(b)) for b in ad.BANDS} == {envelope.frames}

    @pytest.mark.parametrize("name", sorted(TONAL))
    def test_a_tone_reads_as_its_rms(self, decoder, name):
        """The fixtures' 441 Hz tone is 0.61 of full scale: RMS 0.43.

        The mono downmix is at unit gain; FFmpeg's default would add 3 dB.
        """
        envelope = ad.decode_envelope((_FIXTURES / name).resolve(), decoder)
        loudest = max(envelope.full)
        assert loudest == pytest.approx(0.61 / 2**0.5, abs=0.03)
        assert envelope.decode_errors == 0

    @pytest.mark.skipif(
        len(ad.platform_transports()) < 2, reason="this platform has one transport"
    )
    def test_the_transports_agree(self, decoder):
        source = (_FIXTURES / "bands.flac").resolve()
        piped = ad.decode_envelope(source, decoder, transport=ad.TRANSPORT_PIPE)
        filed = ad.decode_envelope(source, decoder, transport=ad.TRANSPORT_FILE)
        for band in ad.BANDS:
            assert list(piped.band(band)) == list(filed.band(band))


class TestTheBands:
    """``bands.flac``: 60 Hz, 1 kHz, 6 kHz, two seconds each."""

    @pytest.fixture(scope="class")
    def envelope(self, decoder) -> ad.Envelope:
        return ad.decode_envelope((_FIXTURES / "bands.flac").resolve(), decoder)

    @pytest.mark.parametrize("index, band", [(0, "low"), (1, "mid"), (2, "high")])
    def test_each_section_is_in_its_own_band(self, envelope, index, band):
        """At least 12 dB above both other bands, which proves the order too."""
        peaks = _section_peaks(envelope, index)
        for other in ("low", "mid", "high"):
            if other != band:
                assert peaks[band] > peaks[other] * 10 ** (12 / 20), (
                    f"section {index + 1}: {band} {peaks[band]:.4f}, "
                    f"{other} {peaks[other]:.4f}"
                )

    @pytest.mark.parametrize("index", [0, 1, 2])
    def test_the_full_band_holds_every_section(self, envelope, index):
        peaks = _section_peaks(envelope, index)
        assert peaks["full"] == pytest.approx(0.61 / 2**0.5, abs=0.03)

    def test_its_length_is_the_files(self, envelope):
        assert abs(envelope.frames - _length_samples(_FIXTURES / "bands.flac")) <= 1


class TestFilesThatAreNotAudio:
    def test_a_zero_byte_file_is_undecodable(self, decoder, tmp_path):
        source = tmp_path / "empty.mp3"
        source.write_bytes(b"")
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(source, decoder)
        assert caught.value.reason == "undecodable"

    def test_text_with_an_audio_extension_is_undecodable(self, decoder, tmp_path):
        source = tmp_path / "notes.flac"
        source.write_text("not audio at all", encoding="utf-8")
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(source, decoder)
        assert caught.value.reason == "undecodable"

    def test_a_wav_with_no_samples_has_no_audio(self, decoder, tmp_path):
        import wave

        source = tmp_path / "silence.wav"
        with wave.open(str(source), "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(44100)
            wav.writeframes(b"")
        with pytest.raises(ad.DecodeFailed) as caught:
            ad.decode_envelope(source, decoder)
        assert caught.value.reason == "no_audio"

    def test_a_truncated_file_draws_what_decoded_and_says_so(self, decoder, tmp_path):
        """A cut download: part of it decodes, and the decoder's errors are kept."""
        whole = (_FIXTURES / "bands.flac").read_bytes()
        source = tmp_path / "cut.flac"
        source.write_bytes(whole[: len(whole) // 2])
        envelope = ad.decode_envelope(source, decoder)
        assert 0 < envelope.frames < _length_samples(_FIXTURES / "bands.flac")
        assert envelope.decode_errors > 0

    def test_a_file_that_has_gone_is_not_a_failure(self, decoder, tmp_path):
        with pytest.raises(ad.FileGone):
            ad.decode_envelope(tmp_path / "gone.flac", decoder)


class TestPaths:
    def test_a_name_beginning_with_a_dash_is_a_file(self, decoder, tmp_path):
        source = tmp_path / "--start=50%.wav"
        shutil.copyfile(_FIXTURES / "tone.wav", source)
        envelope = ad.decode_envelope(source, decoder)
        assert abs(envelope.frames - _length_samples(source)) <= 1

    def test_a_unicode_path(self, decoder, tmp_path):
        folder = tmp_path / "Café Del Mar – 夜"
        folder.mkdir()
        source = folder / "Ünïcödé 曲.flac"
        shutil.copyfile(_FIXTURES / "tone.flac", source)
        envelope = ad.decode_envelope(source, decoder)
        assert envelope.frames > 0

    def test_nothing_is_left_in_the_temporary_folder(self, decoder, tmp_path):
        work = tmp_path / "work"
        work.mkdir()
        for transport in ad.platform_transports():
            ad.decode_envelope(
                (_FIXTURES / "tone.wav").resolve(),
                decoder,
                transport=transport,
                workdir_root=work,
            )
        assert list(work.iterdir()) == []
        assert ad.live_children() == 0


class TestTheReleaseCheck:
    def test_the_analysis_check_passes_on_this_decoder(self, decoder):
        lines = fps.check_analysis(decoder, quiet=True)
        assert any("bands at least" in line for line in lines)
        assert any("EBU Tech 3341" in line for line in lines)


class TestLoudness:
    """WAVE-08: the meter, measured on the pinned build, changes no waveform."""

    @pytest.mark.parametrize("name", ("bands.flac", *FORMAT_FIXTURES))
    def test_the_meter_leaves_every_stored_waveform_as_it_was(
        self, decoder, name, monkeypatch
    ):
        """Why ``ANALYSIS_VERSION`` stays 2: the stored picture is the same.

        The meter hands the next filter doubles where the file's own format was
        handed before, so an envelope value can differ in its last float bit
        (measured: at most 7e-7). The picture stored from it, a byte a band,
        is the same byte for byte, which is what a stored waveform is.
        """
        from cuepoint.core.waveform import reduce

        source = (_FIXTURES / name).resolve()
        measured = ad.decode_envelope(source, decoder)
        without = ad.filter_graph().removeprefix(ad.LOUDNESS_METER + ",")
        monkeypatch.setattr(ad, "filter_graph", lambda: without)
        plain = ad.decode_envelope(source, decoder)

        assert measured.frames == plain.frames
        for band in ad.BANDS:
            assert measured.band(band) == pytest.approx(plain.band(band), abs=1e-6)

        def picture(envelope: ad.Envelope) -> bytes:
            bands = [envelope.band(band) for band in ad.BANDS]
            return reduce(bands, envelope.duration_ms).data

        assert picture(measured) == picture(plain)
        assert plain.loudness == ad.NOT_MEASURED

    @pytest.mark.parametrize(
        "name, expected",
        [
            # A 22,050 Hz mono file, measured as played on both sides.
            ("bands.flac", ad.Loudness(-3.5, -4.3, None)),
            # 0.26 s: shorter than one 400 ms block.
            ("tone.flac", ad.Loudness(None, -4.3, ad.LOUDNESS_TOO_QUIET)),
            ("tone.wav", ad.Loudness(None, -4.3, ad.LOUDNESS_TOO_QUIET)),
            ("tone.aiff", ad.Loudness(None, -4.3, ad.LOUDNESS_TOO_QUIET)),
            ("tone.m4a", ad.Loudness(None, -4.3, ad.LOUDNESS_TOO_QUIET)),
            # Constructed silence.
            ("tone.mp3", ad.Loudness(None, None, ad.LOUDNESS_SILENT)),
        ],
    )
    def test_each_fixture_is_measured(self, decoder, name, expected):
        envelope = ad.decode_envelope((_FIXTURES / name).resolve(), decoder)
        assert envelope.loudness == expected

    @pytest.mark.parametrize("transport", ad.platform_transports())
    def test_the_transports_agree(self, decoder, transport):
        source = (_FIXTURES / "bands.flac").resolve()
        envelope = ad.decode_envelope(source, decoder, transport=transport)
        assert envelope.loudness == ad.Loudness(-3.5, -4.3, None)


class TestADecoderThatCannotRunTheFilters:
    """mpv drops a graph it cannot configure and plays on, exit code 0.

    Unfiltered audio read as four bands would be a waveform of nonsense, and
    every file in a library would get one. The log's output line is what tells
    the two apart, so this is proved with a real decoder given a graph it drops.
    """

    def test_it_is_the_decoders_failure_and_no_file_is_blamed(
        self, decoder, monkeypatch
    ):
        # `amerge` without channel layouts fails at configuration, not parsing.
        monkeypatch.setattr(
            ad, "filter_graph", lambda: "asplit=2[a][b];[a][b]amerge=inputs=2"
        )
        with pytest.raises(ad.DecoderUnavailable, match="did not run as built"):
            ad.decode_envelope((_FIXTURES / "tone.wav").resolve(), decoder)

    def test_a_graph_it_cannot_parse_is_the_same(self, decoder, monkeypatch):
        monkeypatch.setattr(ad, "filter_graph", lambda: "nosuchfilter")
        with pytest.raises(ad.DecoderUnavailable):
            ad.decode_envelope((_FIXTURES / "tone.wav").resolve(), decoder)
