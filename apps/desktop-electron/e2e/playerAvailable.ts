/**
 * Whether this machine has an audio player for the tests that play.
 *
 * Windows and macOS fetch the pinned `mpv` (`python scripts/fetch_player_sidecar.py`).
 * Linux pins none (best-effort, DEC-055), so there the tests that play skip,
 * as the waveform tests already do, unless `CUEPOINT_MPV_PATH` names one.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const hasPlayer = Boolean(
  resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }),
);

export const NO_PLAYER =
  "no mpv: run `python scripts/fetch_player_sidecar.py` or set CUEPOINT_MPV_PATH";
