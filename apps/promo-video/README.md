# CuePoint promo video

A 26-second promo in two cuts, made from code so it can be re-rendered whenever the app or the site
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
npm run mux -- --track=/path/to/track.mp3 --start=230.821 --bpm=130
```

`--start` is where the piece begins in the track and `--bpm` the track's tempo; the piece is stretched
to the promo's tempo, so starting it a whole number of bars before a drop puts the drop on a cut
(three bars before a drop lands it on the cut into Clean; the example starts three bars before Water's second drop, after the breakdown). The files come out as `out/*-PRIVATE.mp4`.
They are for your own use: posting commercial music needs a license, and platforms may mute or claim
it. Never commit the track (`.gitignore` keeps audio files out).

## How it is made

- **One clock** (`src/timing.ts`): 136 BPM, 15 bars, about 26 s at 30 fps. Shots, captions and
  the music all sit on the same beat grid.
- **The opening** is the website's 3D scene, the crate becoming the Camelot wheel (DEC-189), driven by
  time instead of scroll. The video keeps its own frozen copy in `src/scene/` (see its README), so the
  site's home page can change without touching the approved video.
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

## The LinkedIn demo (`demo/`)

An 80 s tour of every page, from real recordings of the app, in 4:5 (1080 x 1350, LinkedIn's feed) and 16:9.

1. Record the clips from the running app, on the README's made-up library (Linux, under X):
   `cd ../desktop-electron && CUEPOINT_CAPTURE_DEMO=1 CUEPOINT_DEMO_OUT=<raw dir> xvfb-run -a -s "-screen 0 2700x1800x24" npx playwright test --config e2e/capture/playwright.capture.config.ts demo`
   (`CUEPOINT_DEMO_ONLY=keys,save` retakes some; a cloud container also needs mpv and a pulseaudio null sink).
2. Render: `node scripts/render-demo.mjs --raw=<raw dir>`
   (`--stills=5,20` for a quick look, `--format=portrait|wide` for one cut).
   The opening (the name over the app itself) and the end card are title cards `demo/demo.js` draws.

`demo/shots.js` holds each shot: its caption, its length in bars (130 BPM), which parts of its clip are used
(dead moments left out, parts joined by short dissolves, always at normal speed), and the camera keyframes, timed
in clip seconds. Shots dissolve into each other; keep zooms framed so the dialog or list a shot is about stays
wholly in view. Music: `--track=<your own file> --start=<s>` names the output -PRIVATE;
the track never goes in the repository.
