# Bundled third-party component: mpv

CuePoint distributes an unmodified prebuilt **mpv** binary as a separate player
sidecar process (DEC-005, DEC-049, PLAYER-01). This file records what is
shipped, where it came from, and what distributing it obliges us to do.

The pinned build, its download URL and its SHA-256 live in
`scripts/player_sidecar_manifest.json`. `scripts/fetch_player_sidecar.py`
downloads it, verifies it against the checksum GitHub publishes for the asset,
and copies the licence texts in this directory next to the installed binary, so
every packaged CuePoint carries them.

## What is shipped

| | |
| --- | --- |
| Component | mpv (https://mpv.io) |
| Upstream | https://github.com/mpv-player/mpv |
| Build source | mpv's own GitHub CI builds, the `git-release` tag |
| Modified? | **No.** The binary is shipped byte-for-byte as published. |
| Linked? | **No.** It runs as a separate process, controlled over mpv's JSON IPC protocol. |

Only a subset of each archive is installed — the executable (plus, on macOS, the
`mpv.app` bundle it needs) and these licence texts. Nothing is patched,
recompiled or relinked. The Windows archive's `mpv-register.bat` /
`mpv-unregister.bat` are deliberately **not** shipped: they register mpv as a
system media handler, which is not something an application should do to a
user's machine on their behalf.

## Licence

The mpv builds CuePoint bundles are **GPL-2.0-or-later**. mpv can be built in an
LGPL configuration, but the published CI builds are not: they include
GPL-licensed components (for example `libdvdcss`), which makes the resulting
binary GPL.

CuePoint's own source code remains **Apache-2.0** (see `LICENSE`). These two
licences coexist here because mpv is *aggregated*, not incorporated:

- mpv runs as a **separate process**, started as a child of CuePoint.
- The two communicate only over mpv's own JSON IPC protocol on a socket or
  named pipe — an arm's-length interface mpv publishes for exactly this use.
- No mpv code is linked into, compiled into, or derived from CuePoint's code,
  and no CuePoint code is derived from mpv's.

Distributing the binary carries GPL obligations, which is why this directory
exists:

1. **The licence text travels with the binary.** `LICENSE.GPL`, `LICENSE.LGPL`
   and `Copyright` are fetched from the pinned upstream commit and copied into
   `resources/player/<os>/licenses/` in every packaged build. The build fails if
   they are missing — see `copy_license_files` in the fetch script.
2. **The corresponding source is identified.** The exact commit is recorded in
   the manifest (`commit`) and in the install receipt written beside the binary,
   and the source for that commit is published at the `source_url` the manifest
   records.
3. **The binary is unmodified**, so there are no changes of ours to publish.

### If this needs to change

Two things would change the analysis, and both are decisions rather than
implementation details:

- **Linking libmpv instead of spawning mpv.** DEC-049 explicitly rejected a
  native addon, and this is one of the reasons to keep rejecting it: linking
  libmpv into CuePoint's own process is a different licensing question with a
  different answer.
- **Shipping an LGPL mpv build.** mpv supports an LGPL build configuration, but
  no first-party LGPL *player* binary is published — only LGPL `libmpv`
  development builds, which would require the linking approach above. Getting an
  LGPL player would mean building mpv ourselves, which DEC-049 also rejected.

`docs/ui-overhaul/adr/004-player-backend.md` records the reasoning in full.
