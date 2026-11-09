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

An 85 s tour of every page, from real recordings of the app, in 4:5 (1080 x 1350, LinkedIn and the Instagram feed), 16:9 (YouTube) and 9:16 (Instagram Reels, laid out inside the safe area).

1. Record the clips from the running app, on the README's made-up library (Linux, under X):
   `cd ../desktop-electron && CUEPOINT_CAPTURE_DEMO=1 CUEPOINT_DEMO_OUT=<raw dir> xvfb-run -a -s "-screen 0 2700x1800x24" npx playwright test --config e2e/capture/playwright.capture.config.ts demo`
   (`CUEPOINT_DEMO_ONLY=keys,save` retakes some; a cloud container also needs mpv and a pulseaudio null sink).
2. Render: `node scripts/render-demo.mjs --raw=<raw dir>` (`--stills=5,20` for a quick look,
   `--format=portrait|wide|tall` for one cut, `--opening=a|b|c` for another opening than c, the problem first: a pull back
   from the live app, or a logo build). The openings and the end card are title cards `demo/demo.js` draws.
3. When the camera plan changes: `python3 scripts/track-pointer.py` once per set of clips (needs
   opencv-python-headless) and `node scripts/verify-demo.mjs`, which fails if the mouse leaves the frame during
   an action or a camera move is under 1.6 s (1.0 s in the short edit, whose moves start on the click).
4. The shorter cuts: `--edit=short` is the 60 s LinkedIn cut (3-bar opening, all ten features, faster waits: a
   click is kept 0.4 s, no wait between two moments rests over a second, 0.6 s dissolves, each shot opens on
   the whole window and zooms on the click); `--edit=story` is the 30 s Instagram story cut. Both are `STORY` and `SHORT` in
   `demo/shots.js`. `--edit=underscore` is the short edit re-budgeted to 25 bars for Musinova's "Minimal
   Techno Electronic Underscore" (Pixabay, 100 BPM; an edit may name its own `bpm`, and half bars are allowed
   since two beats still land on a beat): `--track=<that mp3> --start=33.42` puts the track's return on the
   cut into Clean and its own fade-out under the end card. `--edit=technology` is the short edit bar for bar on
   sub_clair's "Technology" (Pixabay, 125 BPM): `--track=<that mp3> --start=62.72` lands its return on Clean.
   `--edit=fix|free|dig|prep|roundtrip` are five single-angle LinkedIn spots (15 to 31 s, `SPOTS`): the short
   edit's clips and pace with their own opening lines, captions and end line, on Technology with `--start=32.03`.

`demo/shots.js` holds each shot: its caption, its length in bars (130 BPM), the stretch of its clip used and the
moments in it that play at normal speed (`keep`: the clicks, the typing, things appearing). Nothing is cut: the
waits between those moments run faster, easing there and back, by exactly the factor that fills the slot. Camera
keyframes are in shot seconds; frame each so the dialog or list a shot is about and the mouse stay wholly in view.
Shots dissolve into each other, and the rail chip and counter hand over under the same dissolve. Music: `--track=<your own file> --start=<s>` names the output -PRIVATE;
the track never goes in the repository. Its loudness is measured over the stretch used and applied as one static
gain, so a breakdown or a fade-out in the music stays as the track has it.

## The short films

`film/` holds films that are not cuts of the tour. `node scripts/render-film.mjs --film=<name> --raw=<recordings>`
renders one at 1080 x 1350 (`--stills=5,12` for a quick look, `--track=<mp3> --start=<s>` for music).

- `wipe` (30.9 s): the same Library before CuePoint and after, split by a slider, in three chapters (keys, the
  match, the whole page). It reads the before/after stills the capture spec takes either side of Clean and Save to
  files (`wipe-library-*.png`, `wipe-details-*.png`, so record with `CUEPOINT_DEMO_ONLY=player,wipe,clean,save`).
  Music: sub_clair's "Technology", `--start=56.97` puts its return on the last chapter's wipe.
- `onetake` (26.5 s): the Clean clip at its own speed with no cuts or chrome, the camera creeping in and then
  pushing into the match dialog, the pointer lit, words only at the end. Music: Musinova's "Minimal Techno
  Electronic Underscore", `--start=33.49` brings the beat back on the first "Use this match".

Three fast films cut on the beat show all ten features (`film/fast.js` lists what each plays and where its moment
is). They read the ten clips the capture spec records (slam also the before still of the library):

- `slam` (30.7 s): problem words slam over the old library, the icon builds from blocks, then each feature floats
  in 3D under its word, punches in on beat 2 and leaves by a whip, slash, flip or zoom; eight half-beat cuts, chips
  burst round the end card. sub_clair's "Technology", `--start=72.53` puts the drop on the first feature.
- `grid` (31.2 s): paper-light, huge kinetic type ("TEN TOOLS. ONE APP."), nine features in a grid on the return,
  five bars of split screens pushing in on the beats, sixteen flash cuts, a mosaic that folds into the end card.
  Musinova's "Minimal Techno Electronic Underscore", `--start=45.62` brings the beat back on the grid.
- `tunnel` (30.7 s): one canvas diving from window into window through portals, an RGB-split glitch on each landing,
  then a wall of all ten lighting one by one. sub_clair's "Technology", `--start=89.81`.

Five calm showcase films share one look and a few scene kinds (`film/pro.js`, `pro.css`), each film a list of
scenes in beats (`film/pro-films.js`), rendered as `--film=pro-<name>`:

- `pro-launch` (45.6 s): title, the ten features as numbered chapters (headline, then a glide into the click), end
  card. Underscore, `--start=45.62`.
- `pro-case` (33.6 s): the problem over the old library, five steps in order, the same library after behind a
  slider. Technology, `--start=72.53`.
- `pro-builder` (37.4 s): five product moments, the architecture drawn in, the numbers, end card with GitHub.
  Technology, `--start=72.53`.
- `pro-evening` (48 s): one evening at real speed, full frame, time-stamped lower-thirds. Underscore, `--start=45.62`.
- `pro-why` (32.4 s): first-person lines, the product in the maker's words, signed. Underscore, `--start=40.82`.
- `pro-showcase` (79.2 s), the one to post: the opening of `pro-why` (one sentence at a time, the old library then
  settling into the app window), the ten features of `pro-launch` held longer, the ending of `pro-builder`. Underscore
  lengthened by hand to 79.35 s (from 38.42 s, with four bars repeated and its groove from 19.22 s joined on), `--start=0`.
  `--size=9x16` and `--size=16x9` render it taller or wider, keeping each headline up while the window grows beside it.
