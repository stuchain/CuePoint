# CuePoint promo video

A 20-second promo in two cuts, made from code so it can be re-rendered whenever the app or the site
changes:

- `cuepoint-promo-16x9` (1920 x 1080) for the website's home page and YouTube
- `cuepoint-promo-9x16` (1080 x 1920) for Reels, TikTok and Shorts

Each comes as MP4 (H.264 + AAC), WebM (VP9 + Opus) and a poster PNG. Captions are burned in, so it
works with the sound off.

## Render

```sh
cd apps/promo-video
npm ci
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run render   # leave PW_CHROMIUM_PATH out if Playwright's own Chromium is installed
```

The files land in `out/` (not committed). `npm run dev` plays the promo live in a browser
(`?format=tall` for the vertical cut). A quick look without a full render:

```sh
node scripts/render.mjs --stills=2,9.5,25          # PNGs at those seconds, both cuts
node scripts/render.mjs --format=tall --frames=90  # the first three seconds of one cut
```

## A private cut with your own music

After a render, put a piece of a track you own under the picture:

```sh
npm run mux -- --track=/path/to/track.mp3 --start=40.663 --bpm=130
```

`--start` is where the piece begins in the track and `--bpm` the track's tempo; the piece is stretched
to the promo's tempo, so starting it a whole number of bars before a drop puts the drop on a cut
(two bars before lands it on the cut into Clean). The files come out as `out/*-PRIVATE.mp4`.
They are for your own use: posting commercial music needs a license, and platforms may mute or claim
it. Never commit the track (`.gitignore` keeps audio files out).

## How it is made

- **One clock** (`src/timing.ts`): 132 BPM, 11 bars, exactly 20 s at 30 fps. Shots, captions and
  the music all sit on the same beat grid.
- **The opening** is the website's own 3D scene, the crate becoming the Camelot wheel (DEC-189),
  imported read-only from `apps/website/src/three` and driven by time instead of scroll. Changes to the
  site's scene show up here on the next render.
- **The app shots** (`src/shots.ts`, `src/content.ts`) sit centered in their own CSS 3D space: the
  camera settles onto each at an angle and drifts round to near frontal, and shots change on a hard
  cut on the downbeat. They are stand-ins drawn in the app's pixel style
  with a made-up library, marked "Preview" in the title bar, until the redesigned pages (Phases 14
  and 15) can be captured. Colors come from the app's theme file; key colors from the app's icon.
- **The music** (`scripts/beat.mjs`) is synthesized from scratch, so there is nothing to license.
- **The render** (`scripts/render.mjs`) seeks a paused GSAP timeline frame by frame in headless
  Chromium (software WebGL), screenshots the stage, and pipes the frames to ffmpeg, with the audio
  normalized to -14 LUFS.

Needs Node 22.18+ (the scripts import the TypeScript timing directly) and ffmpeg (with libx264, libvpx-vp9, libopus) on the PATH.

## When the redesigned pages land

Replace the stand-in shots with captures of the real app (SITE-04's capture script and made-up
library), set `APP_PREVIEW` to `false` in `src/content.ts`, and render again.
