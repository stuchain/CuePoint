# CuePoint website: product context

This is the context the design skills (impeccable) read. It describes the product and the voice.
The look is defined by the app; the summary below is not the source of truth.

## What CuePoint is

CuePoint is a free desktop app for DJs. It cleans up a Rekordbox library. It reads the collection you
export from Rekordbox as XML, matches your tracks to Beatport, and fills in what is missing or wrong:
key, tempo, label and genre. Your own values are kept over Rekordbox's, and every change is in the
track's history.

What a DJ does with it:

- **Library:** browse, search and filter the whole collection, with the Camelot wheel to see and pick
  by key.
  - **Collections:** CuePoint's own Collections and Smart Collections, beside Rekordbox's playlists.
- **Clean:** match tracks on Beatport, review the matches, find missing files and possible duplicates, and see what needs you.
- **Keys:** the key view of the collection.
- **Discover:** find new music on Beatport from the artists and labels already in the library, and
  keep a wantlist.
- **Prepare (Sets):** plan a set as a running order, with transition checks and suggestions for a gap.
- **Statistics:** what the library holds and how it is used.
- **Export:** the cleaned library goes back to Rekordbox as XML.

(Page names follow the app; check `docs/user-guide/` and `docs/v1/` before naming a feature on the
site. Do not invent features.)

## Who it is for

DJs. They are not technical. They know Rekordbox, Beatport, keys and BPM, and they do not know or care
about databases, services or command lines. The site must make sense to a DJ in one read, with no
jargon about how the app works inside.

## Voice

- Plain American English ("color", "organize", "favorite"; DEC-158).
- Say what it does for a DJ before how it does it (DEC-132).
- Never say "engine" or "jobs" (DEC-155). Running work is "background work".
- Short sentences. No hype. No claim the app does not back up.

## The look

The site wears the app's own pixel design system. The source of truth is
`docs/v1/PIXEL_DESIGN_SYSTEM.md` and the renderer's tokens in
`apps/desktop-electron/renderer/src/tokens/`; the site's tokens are generated from them (SITE-02), not
copied by hand.

In short: square corners, solid black outlines, bevels, zero-blur hard shadows, Pixelify Sans for
chrome. There are five themes, and Neo Dark (violet on zinc) is the default (DEC-190).

The 3D extends the app's look and never replaces it. The opening scene is the crate becoming the
Camelot wheel (DEC-189): a voxel crate of unlabeled records, which take their key, tempo and genre and
fly into a lit Camelot wheel. The mark is the Camelot wheel icon (DEC-210). It is the app's icon (DIST-09); the site reuses it and draws no new mark (DEC-198). The source grids are `apps/desktop-electron/build/icon-source/mark-*.svg`.

### Prose font

**Atkinson Hyperlegible Next** (OFL, variable, self-hosted from `@fontsource-variable/atkinson-hyperlegible-next`) for long text: the guide, the blog, paragraphs. Pixelify Sans stays for headings, navigation, buttons and badges (weights 600 and 700, ligatures off: its `fi` and `fl` ligatures read as other letters).
Why: it was drawn by the Braille Institute for letter recognition (distinct `I`, `l`, `1`, `0`, `O`), so it holds up at length and on small screens, and it is a clear step away from Pixelify's chrome without borrowing the app's own data face, Inter, or the default families every generated page reaches for. Both fonts load through Astro's Fonts API from `node_modules` (no CDN, no Google request), `font-display: swap`, with metric-matched fallbacks, and the heading font is preloaded.

### Tokens on the web

`scripts/sync-tokens.mjs` writes `src/styles/tokens.generated.css` from the app's tokens (never edit it). It fixes the app's `--scale` at **WEB_SCALE = 1.25**: sizes become `rem`, so body text (`--font-size-md`, 14px) is 1.0938rem (17.5px). Hairlines (border widths, bevels, the focus ring, shadow offsets) stay in whole `px`, at least 1px, so outlines stay crisp. `round()`, `max()`, `min()`, `clamp()` and `@property` initial values are resolved at that scale where computable and passed through otherwise.

Color rules that keep every theme at 4.5:1: muted text only on the page background (not on panels or bars); black (`--border-outline`) text on accent fills; links and headings in `--fg-primary`. The focus ring is the accent inside a `--fg-primary` halo.

## Constraints

- Hosted on GitHub Pages under `/CuePoint/` until a domain is bought (DEC-139, DEC-196). No custom
  headers; static output only.
- No download is offered until 1.0.0 (DEC-194).
- Sound only when the visitor asks for it (DEC-191).
