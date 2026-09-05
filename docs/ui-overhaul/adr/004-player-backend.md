# ADR-004: Player backend and packaging

## Status

Accepted (PLAYER-01, 2026-09-05). Supersedes the original HTML5-first
recommendation recorded in `docs/v1/OPEN_QUESTIONS.md` Q-005.

## Context

CuePoint had no audio playback of any kind: the Phase 0 audit confirmed zero
`<audio>`, player or waveform references anywhere in the renderer. Phase 5 adds
it, and the user's requirement was foobar2000-grade playback — gapless, wide
lossless format support, high-quality resampling.

Four backends were evaluated (Q-005). HTML5 `<audio>` inside the renderer is by
far the least work but is capped by what Chromium ships: no APE, no WavPack,
inconsistent AIFF, and no exclusive-mode output. BASS is proprietary and needs a
paid distribution licence. A raw ffmpeg/libavcodec binding is the most flexible
and the most work. libmpv is the engine behind mpv, mpv.net and IINA, with the
format coverage and the resampler the requirement asks for.

DEC-005 chose libmpv. It did not say what "a libmpv sidecar" is made of, and
that question — settled here and in DEC-049 — is what determines the packaging,
signing and IPC work.

## Decision

**Bundle the official prebuilt `mpv` executable per platform and control it over
mpv's JSON IPC protocol**, as a second supervised sidecar alongside the Python
engine.

- Acquisition is a build step, not a compile step:
  `scripts/fetch_player_sidecar.py` downloads a pinned release asset, verifies
  it against the SHA-256 GitHub publishes for that asset, and installs a
  declared subset into `apps/desktop-electron/resources/player/<os>-<arch>/`.
- The binaries are **not committed**. `resources/` is build output, exactly as
  `resources/engine/` is.
- Control is over a named pipe (Windows) or unix socket (macOS), using mpv's own
  JSON IPC protocol. PLAYER-02 and PLAYER-03 build the client and the
  supervisor.

### Rejected alternatives

**A native N-API addon linking libmpv.** Lowest latency and direct property
access, but it needs per-OS, per-Electron-ABI compilation, a prebuild pipeline,
and it turns a decoder crash into an application crash. It also changes the
licensing question (see below) from aggregation to linking.

**A custom C/Rust wrapper around libmpv.** Most control over the protocol, most
new code, and the only option that puts a toolchain we own into a release path
the Phase 0 audit already called lightly tested.

**HTML5 `<audio>`.** Cannot deliver the formats or the output control the
requirement names.

## Consequences

### Positive

- Reuses a pattern the repository already has. `EngineSupervisor` spawns a
  bundled binary, restarts it with bounded backoff, reports health to the status
  strip and fails visibly; `PlayerSupervisor` is written in its image.
- No compiler in the release path for this component.
- The pinned build was verified to carry everything Phase 5 depends on:
  FLAC, ALAC, WavPack, Monkey's Audio, AAC, MP3 and big-endian PCM decoders,
  plus `--input-ipc-server`, `--gapless-audio`, `--audio-exclusive` and
  `--audio-device`. The verification runs as a smoke test on every fetch rather
  than being a claim in a document.
- Verified in a packaged build: `resources/player/mpv.exe` is present in
  `release/win-unpacked` and runs from there.

### Negative

- **Installer size.** The Windows payload is ~63 MB extracted; the macOS
  `mpv.app` bundle is ~112 MB. That is a real cost per platform, on top of the
  Python engine sidecar.
- **A second binary to sign and notarize.** On macOS the bundle contains 130+
  dylibs, all of which must be signed with the hardened runtime, and
  notarization of a third-party binary inside the app bundle is the specific
  risk PLAYER-01 flagged. This is not proven until a signed, notarized macOS
  build has actually been produced.
- **Pins expire.** mpv publishes no binaries on its stable tags — `v0.40.0` and
  friends carry zero release assets — so the only first-party builds live on the
  rolling `git-release` tag, whose assets are replaced when CI republishes. A
  pinned asset will eventually 404. This is handled rather than ignored: the
  fetcher detects that case specifically and reports the command that re-pins
  (`--update-manifest`), which downloads, re-verifies against upstream digests
  and rewrites the manifest for review. It is a maintenance obligation, and it
  should be expected roughly as often as mpv's CI publishes.
- **Two processes to supervise and to shut down.** A leaked mpv holding an
  exclusive audio device after CuePoint exits would be the worst bug of Phase 5;
  PLAYER-03 owns preventing it.

### Licensing

The bundled builds are **GPL-2.0-or-later**, not LGPL. mpv supports an LGPL
build configuration, but the published first-party builds are not built that way
— they include GPL components such as `libdvdcss` — and no first-party LGPL
*player* binary is published at all (only LGPL `libmpv` development builds,
which would require the linking approach this ADR rejects).

CuePoint's own code stays Apache-2.0. The two coexist because mpv is aggregated,
not incorporated: it runs as a separate process and the two communicate only
over mpv's published JSON IPC interface. Distributing the binary carries GPL
obligations, which are discharged by shipping the licence texts beside the
binary in every package, recording the exact upstream commit so the
corresponding source is identifiable, and shipping the binary unmodified.
`third_party/mpv/NOTICE.md` records this in full, and
`scripts/check_bundled_licenses.py` fails the build if any of it goes missing.

> **Note for the decision log.** DEC-049's implications list says "LGPL
> compliance is satisfied by shipping the binary unmodified". Implementation
> showed the licence is GPL, not LGPL. The *conclusion* is unaffected — an
> unmodified binary in a separate process is the shape that works under either —
> but the obligation is the GPL's, and the characterization in DEC-049 should be
> amended rather than left to mislead a future reader.

## Notes

- Linux is best-effort and pins no binary. `python scripts/fetch_player_sidecar.py`
  exits 0 with a notice there, and users point CuePoint at a distribution mpv
  with `CUEPOINT_MPV_PATH` (consumed by PLAYER-03).
- `extraResources` uses electron-builder's `${os}-${arch}` macros, which expand
  to `mac` / `win` / `linux` and `x64` / `arm64` — **not** `darwin` / `win32`.
  The player's install directories use that vocabulary, and unit tests assert
  they keep doing so, because getting it wrong makes electron-builder skip the
  payload with only a warning and produce an app with no player in it — which is
  precisely what had been happening to the *engine* sidecar, whose `${os}` path
  never resolved on Windows or macOS until PLAYER-01 found it. Both sidecars now
  use the same vocabulary and
  `src/tests/unit/scripts/test_packaging_resource_paths.py` holds them to it. The
  arch half also keeps the two macOS pins from overwriting each other. A *universal*
  macOS build would expand `${arch}` to `universal` and match neither directory;
  CuePoint does not build one today, and doing so would need the two payloads
  merged first.
