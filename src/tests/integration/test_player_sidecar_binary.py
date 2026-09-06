"""Integration tests against the real bundled mpv binary (PLAYER-01, DEC-049).

These are the tests that answer the questions the unit tests cannot: is the
artifact we pinned actually able to do the job Phase 5 needs, on this operating
system? They run the binary.

Every test skips when the sidecar has not been fetched, so a clean checkout and
a contributor who has not run the fetch script still get a green suite. CI runs
`python scripts/fetch_player_sidecar.py` before pytest on Windows and macOS, so
they do execute where it matters.

Fetch it locally with::

    python scripts/fetch_player_sidecar.py
"""

from __future__ import annotations

import array
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

# src/tests/integration -> 4 levels up
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCRIPT = _REPO_ROOT / "scripts" / "fetch_player_sidecar.py"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("fetch_player_sidecar", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


fps = _load_script_module()

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def manifest():
    return fps.load_manifest()


@pytest.fixture(scope="module")
def binary(manifest) -> Path:
    """The installed player binary, or a skip if it was never fetched."""
    key = fps.host_target_key()
    target = manifest.targets.get(key)
    if target is None or not target.supported:
        pytest.skip(f"no player sidecar is pinned for {key}")
    # Wrapped in Path(): the module is loaded dynamically, so its return type
    # is Any as far as mypy is concerned.
    path = Path(fps.binary_path_for(target, fps.DEFAULT_DEST))
    if not path.exists():
        pytest.skip(
            f"player sidecar not installed at {path}; "
            "run `python scripts/fetch_player_sidecar.py`"
        )
    return path


class TestInstalledBinary:
    def test_it_is_the_pinned_build_with_every_capability(self, manifest, binary):
        """The whole smoke test: version, decoders and options together."""
        fps.smoke_test(manifest, binary, quiet=True)

    def test_it_reports_the_pinned_version(self, manifest, binary):
        output = subprocess.run(
            [str(binary), "--version"], capture_output=True, text=True, timeout=60
        ).stdout
        assert manifest.version in output

    @pytest.mark.parametrize("decoder", ["flac", "alac", "mp3", "pcm_s16be", "wavpack"])
    def test_lossless_and_lossy_decoders_are_present(self, binary, decoder):
        """DEC-005 chose libmpv for exactly this list; a build missing one of
        them would not deliver the decision."""
        listing = subprocess.run(
            [str(binary), "--ad=help"], capture_output=True, text=True, timeout=60
        ).stdout
        assert fps._lists_decoder(listing, decoder)

    @pytest.mark.parametrize(
        "option",
        [
            "input-ipc-server",
            "gapless-audio",
            "audio-exclusive",
            "audio-device",
            "idle",
        ],
    )
    def test_options_phase_5_depends_on_exist(self, binary, option):
        """PLAYER-02/03 drive it over `--input-ipc-server`; DEC-055 needs the
        device and exclusive options; DEC-056 needs gapless."""
        listing = subprocess.run(
            [str(binary), "--list-options"], capture_output=True, text=True, timeout=60
        ).stdout
        assert f"--{option}" in listing

    def test_the_install_receipt_verifies(self, manifest, binary):
        key = fps.host_target_key()
        receipt = fps.verify_install(manifest.target(key), fps.DEFAULT_DEST)
        assert receipt["version"] == manifest.version
        assert receipt["asset_sha256"] == manifest.target(key).sha256

    def test_licences_ship_beside_the_binary(self, manifest, binary):
        """GPL obligation, enforced where it is easy to break: the licence
        directory sits next to the executable in the packaged app."""
        licenses = binary.parent
        while licenses != licenses.parent and not (licenses / "licenses").exists():
            licenses = licenses.parent
        shipped = licenses / "licenses"
        assert shipped.is_dir(), "no licenses/ directory beside the installed binary"
        for name in manifest.license_files:
            assert (shipped / name).exists(), f"missing {name}"
            assert (shipped / name).stat().st_size > 500


class TestFormatDecoding:
    """The format spike the roadmap has carried since Round 1 (PLAYER-01)."""

    def test_every_promised_format_decodes(self, binary):
        results = fps.check_formats(binary, quiet=True)
        assert len(results) == len(fps.FORMAT_FIXTURES)

    def test_a_tone_fixture_decodes_to_actual_audio(self, binary, tmp_path):
        """Not just 'exit code 0': the decoded PCM has to contain the signal."""
        source = fps.FIXTURE_DIR / "tone.flac"
        out = tmp_path / "decoded.wav"
        subprocess.run(
            [
                str(binary),
                "--no-config",
                "--really-quiet",
                f"--o={out}",
                "--oac=pcm_s16le",
                "--of=wav",
                str(source),
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
        assert out.exists()
        import wave

        with wave.open(str(out), "rb") as wav:
            frames = wav.getnframes()
            pcm = wav.readframes(frames)
        assert frames > 0
        assert fps._rms_16bit(pcm) > fps.MIN_TONE_RMS

    def test_a_corrupt_file_fails_rather_than_producing_silence(self, binary, tmp_path):
        """The negative case: the check must be capable of failing.

        A decoder check that passes on garbage is not checking anything, and
        PLAYER-10 will build real behaviour on top of this failure mode.
        """
        broken = tmp_path / "broken.flac"
        broken.write_bytes(b"fLaC" + b"\x00" * 200)  # header, then nonsense
        out = tmp_path / "out.wav"
        subprocess.run(
            [
                str(binary),
                "--no-config",
                "--really-quiet",
                f"--o={out}",
                "--oac=pcm_s16le",
                "--of=wav",
                str(broken),
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
        produced_audio = False
        if out.exists() and out.stat().st_size > 0:
            import wave

            try:
                with wave.open(str(out), "rb") as wav:
                    produced_audio = wav.getnframes() > 0
            except (wave.Error, EOFError):
                produced_audio = False
        assert not produced_audio, "a corrupt FLAC decoded to audio"


class TestFixtures:
    """The fixtures themselves, independent of any binary."""

    def test_all_five_fixtures_are_committed_and_non_empty(self):
        for name, _label, _tonal in fps.FORMAT_FIXTURES:
            path = fps.FIXTURE_DIR / name
            assert path.exists(), f"missing fixture {name}"
            assert path.stat().st_size > 0

    def test_fixtures_are_small_enough_to_belong_in_git(self):
        total = sum(
            (fps.FIXTURE_DIR / n).stat().st_size for n, _, _ in fps.FORMAT_FIXTURES
        )
        assert total < 512 * 1024, f"audio fixtures total {total} bytes"

    def test_the_mp3_fixture_is_a_valid_mpeg_frame_stream(self):
        """It is constructed rather than encoded (no MP3 encoder ships in the
        bundled build), so its header is worth asserting directly."""
        data = (fps.FIXTURE_DIR / "tone.mp3").read_bytes()
        assert data[0] == 0xFF and (data[1] & 0xE0) == 0xE0, "no MPEG sync word"
        assert (data[1] >> 3) & 0x03 == 0x03, "not MPEG Version 1"
        assert (data[1] >> 1) & 0x03 == 0x01, "not Layer III"


class TestCliAgainstTheRealInstall:
    def test_verify_only_passes_on_the_real_install(self, binary):
        assert fps.main(["--verify-only", "--quiet"]) == 0

    def test_print_path_points_at_something_that_exists(self, binary, capsys):
        assert fps.main(["--print-path"]) == 0
        assert Path(capsys.readouterr().out.strip()).exists()

    def test_a_second_fetch_is_a_no_op(self, manifest, binary):
        """Idempotence: re-running the fetch must not reinstall when the
        install already matches the manifest. Run offline, so a fetch that
        decided to re-download would fail loudly instead of quietly working."""
        target = manifest.target(fps.host_target_key())
        receipt = fps.install_dir_for(target, fps.DEFAULT_DEST) / fps.RECEIPT_NAME
        before = receipt.read_text(encoding="utf-8")

        assert fps.main(["--offline", "--quiet"]) == 0

        assert json.loads(receipt.read_text(encoding="utf-8")) == json.loads(before)


@pytest.mark.integration
class TestGaplessAudio:
    """DEC-056's claim, measured in the samples rather than heard (PLAYER-12).

    The macOS pass asks for gapless "by ear" across two consecutive files. A
    test harness has no ears, but it does not need them: a gap between tracks is
    silence, and added silence is visible in the decoded PCM. This plays the
    fixtures through the real bundled mpv with the same gapless and resampler
    arguments CuePoint runs (`MPV_BASE_ARGS` in `mpvClient.ts`) and captures
    what the audio output actually received.

    **Self-calibrating on purpose.** ``tone.flac`` carries 63.5 ms of its own
    trailing silence — an encoder artifact, nothing to do with the player — so a
    fixed "no quiet run longer than 1 ms" threshold reports a 63.5 ms gap on a
    perfectly gapless join. The measurement that means something is the
    *difference*: render one file, render two, and compare the longest silence.
    Gapless playback adds none.

    It is the stronger half of the acceptance rather than a substitute for it:
    `playbackController.integration.test.ts` shows mpv advances without
    reloading, and this shows the samples never stop for longer than the files
    themselves do. Neither can say whether it *sounds* right, which is why row 9
    of the macOS pass stays open until somebody listens.
    """

    #: A sine at 441 Hz crosses zero 882 times a second, so isolated near-zero
    #: samples are the signal, not a gap. Below 2% of full scale the tone spends
    #: well under a sample per crossing.
    QUIET = int(0.02 * 32768)
    #: One millisecond at 44.1 kHz. Far below anything audible as a gap, and the
    #: allowance for a join landing a sample either side of the boundary.
    TOLERANCE_SAMPLES = 44

    def _render(self, binary, out: Path, sources) -> array.array:
        import wave

        # `--ao=pcm` writes exactly what would have gone to the device, which is
        # the only place a gap introduced by the player would show up.
        result = subprocess.run(
            [
                str(binary),
                "--no-config",
                "--no-terminal",
                "--no-video",
                "--gapless-audio=yes",
                "--audio-resample-filter-size=32",
                "--audio-resample-phase-shift=12",
                "--ao=pcm",
                f"--ao-pcm-file={out}",
                "--audio-channels=mono",
                "--audio-samplerate=44100",
                "--audio-format=s16",
                *[str(s) for s in sources],
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert out.exists(), (
            f"mpv wrote no PCM (exit {result.returncode}): {result.stderr[:400]}"
        )
        with wave.open(str(out), "rb") as handle:
            assert handle.getsampwidth() == 2, "expected 16-bit PCM"
            frames = handle.readframes(handle.getnframes())
        samples = array.array("h")
        samples.frombytes(frames)
        return samples

    def _longest_quiet_run(self, samples) -> int:
        longest = 0
        run = 0
        for sample in samples:
            if abs(sample) < self.QUIET:
                run += 1
                if run > longest:
                    longest = run
            else:
                run = 0
        return longest

    def test_two_tracks_run_together_without_adding_silence(self, binary, tmp_path):
        fixture = fps.FIXTURE_DIR / "tone.flac"
        if not fixture.exists():
            pytest.skip(f"missing fixture: {fixture}")

        once = self._render(binary, tmp_path / "one.wav", [fixture])
        twice = self._render(binary, tmp_path / "two.wav", [fixture, fixture])

        # Both files really played; otherwise "no added silence" is trivially
        # true because there was never a second track.
        assert len(twice) >= 2 * len(once) - self.TOLERANCE_SAMPLES, (
            f"two tracks produced {len(twice)} samples against {len(once)} for "
            "one; the second file did not play"
        )

        baseline = self._longest_quiet_run(once)
        joined = self._longest_quiet_run(twice)
        added = joined - baseline

        assert added <= self.TOLERANCE_SAMPLES, (
            f"the join added {added} samples of silence "
            f"({added / 44100 * 1000:.1f} ms) beyond the {baseline} the file "
            f"carries on its own — that is the gap DEC-056 says must not be there"
        )
