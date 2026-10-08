# CuePoint v1.0.0 — Phase 17: The Website, Detailed Step Specifications

Status: **Specified 2026-10-07. No step is implemented yet.** Thirteen steps, SITE-01…SITE-13.
Writing the steps raised ten questions that Decision Round 14 did not answer. They were asked as
Decision Round 20 (Q-180…Q-189) and answered the same day (DEC-189…DEC-198); each step below names
the decision that settles it. Per the process, no implementation happens
from this document. Each step needs an explicit "Implement SITE-NN" instruction, scoped to exactly
that step, and its outcome is recorded under the step afterwards.

**Amended 2026-10-08 for Phase 14's later decisions** (DEC-199…DEC-209, `PHASE14_PAGES.md` "What the
later phases pick up"): matching is Clean's, not Discover's; the app gains a **Keys** page and takes
keys only from Beatport (DEC-200, DEC-201); the size has a 1.5× step, made with `round()`, `max()`
and `@property` (DEC-161); and reduced motion stops fades too. The text below is changed where these
apply.

Depends on Phases 1–16. Phase 16 must be complete first (DEC-140): the download page offers what
DIST-03 and DIST-04 publish, under DIST-03's file names. The site's pictures are taken of the app as
Phases 14 and 15 leave it. Decision Rounds 1–20 apply (`DECISIONS.md`, DEC-001…DEC-198). This phase's own decisions
are DEC-139 (the site: here, Astro and Three.js, the app's pixel style in 3D), DEC-141 (the release
checklist, each item held by a check), DEC-142 (cookieless analytics), DEC-143 (two forms) and
DEC-144 (the user is the publisher), with DEC-132 (clear to new users), DEC-155 and DEC-158 (the
app's words, American English), DEC-145, DEC-129 and DEC-169…DEC-178 (what a download is and how it updates) and DEC-126 (the app
reports its own errors, which the bug form says).

The step prefix is SITE.

## What this phase is

Today the site is `gh-pages-root/index.html`: one 639-line hand-written page about the retired Qt
app, with Google Analytics, published to the `gh-pages` branch by `scripts/publish_feeds.py`.

This phase replaces it with a site that makes a visitor stop scrolling, and that search engines read
in full:
- **Astro, static.** Every page is plain HTML at build. Search engines and screen readers get all of
  it, and a page is usable before any script runs.
- **Scroll-driven WebGL scenes in the app's pixel style** (DEC-139): voxels, pixel textures, the
  app's palettes, black outlines and hard shadows, built with Three.js and driven by GSAP's
  ScrollTrigger. Each scene loads only once the page is usable and only where it is shown, and each
  has a still picture of itself for slow phones, for no WebGL and for reduced motion.
- **The pages DEC-139 lists:** home, features, download, guide, FAQ, changelog, privacy, terms, a
  blog, and a custom 404.
- **DEC-141's checklist held in CI.** Every item a machine can check fails the build when it breaks:
  titles, descriptions and canonicals, one `h1`, alt text, schema, sitemap, `noindex`, broken links,
  accessibility, Core Web Vitals budgets, mobile widths, `http://` links.
- **Words for someone who has never used Rekordbox's XML** (DEC-132): what the app does for a DJ, in
  plain English (DEC-158), before how.

**What this phase is not.**
- **No change to the app.** Nothing in `apps/desktop-electron/` or `src/cuepoint/` changes, except
  that SITE-04 adds a capture script beside the end-to-end suite. The app's icon is Phase 16's
  DIST-09 (DEC-198).
- **No server.** GitHub Pages serves files; the forms and the analytics are outside services.
- **No other language** (DEC-139), **no newsletter** (DEC-143), **no account or sign-in.**
- **No release made from the site.** Releases are Phase 16's tags; the site reads them.

## Skills for this phase

Vendored in `apps/website/.claude/skills/` (f7f970f; sources in `apps/website/.claude/README.md`).
Claude Code loads them once a session touches `apps/website/`. Each step names the ones it uses.

| Job | Skills |
| --- | --- |
| Taste, layout, type, critique | `impeccable` (with `apps/website/PRODUCT.md`, SITE-01), `frontend-design` |
| 3D | `threejs-fundamentals`, `-geometry`, `-materials`, `-lighting`, `-textures`, `-shaders`, `-postprocessing`, `-interaction`, `-animation`, `-loaders` |
| Scroll motion | `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-performance`, `gsap-utils`, `gsap-frameworks` |
| Speed, accessibility, search basics | `web-quality-audit`, `performance`, `core-web-vitals`, `accessibility`, `seo`, `best-practices` |
| Deep search audit | Claude SEO, installed on the user's Windows PC only; run through Remote Control in SITE-13 |

`gsap-react` is not used: the site is Astro with plain TypeScript islands, not React.

## What the earlier phases already built

| Already exists | Where |
| --- | --- |
| The current site: one page, `robots.txt`, `sitemap.xml` (one URL), a 512×341 logo | `gh-pages-root/` |
| Its publishing: copies those files to the `gh-pages` branch on a push to `main` touching `gh-pages-root/` | `.github/workflows/publish-gh-pages-site.yml`, `scripts/publish_feeds.py --site-only` |
| The address the site answers at, and its canonical | `https://stuchain.github.io/CuePoint/` (`gh-pages-root/index.html:39`) |
| The app's look: tokens, five themes, square corners, black outlines, bevels, zero-blur shadows, Pixelify Sans | `apps/desktop-electron/renderer/src/tokens/` (`tokens.css`, `fonts.css`, `themes/*.css`); described in `docs/v1/PIXEL_DESIGN_SYSTEM.md` |
| The user guide, 16 pages, 4,066 lines | `docs/user-guide/*.md` |
| The changelog, Keep a Changelog format, checked in CI | `docs/release/CHANGELOG.md`, `scripts/validate_changelog.py` |
| The privacy notice and terms of the app | `PRIVACY_NOTICE.md`, `docs/policy/privacy-notice.md`, `docs/policy/terms-of-use.md` (rewritten by REPORT-08 for Sentry) |
| The app driven by Playwright against the real engine, with Beatport stubbed, for screenshots | `apps/desktop-electron/e2e/` (40 specs); used for `docs/v1/phase14/` |
| Releases with every download, named by system and chip, a checksum file and notes; a tag publishes them | DIST-03, DIST-04 (Phase 16) |
| The website skills | `apps/website/.claude/skills/` (26), `apps/website/.claude/README.md` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-139 | `apps/website/`, Astro and Three.js, scroll-driven WebGL in the app's pixel style in 3D; the listed pages; English; GitHub Pages' address until a domain is bought; the address as one setting feeding canonicals, sitemap and `robots.txt`; a still fallback for every scene; the guide built from `docs/user-guide/`; `gh-pages-root/` retired on the first deploy. |
| DEC-141 | Every row of its table, each held by the check it names, in CI on every build where a machine can check it. SITE-03 builds the checks; each later step is held by them; SITE-13 ticks every row with its evidence. |
| DEC-142 | Analytics that set no cookie (Umami Cloud, DEC-192); no banner; a consent component that turns on by itself if a non-essential cookie is ever set; the service named in the privacy policy. |
| DEC-143 | A contact and feedback form and a bug-report form through a form service (Web3Forms, DEC-193); spam protection without a puzzle; the bug form asks for the app version and system and says the app reports errors itself; tested in CI against the service's test mode or a stand-in, and once live before launch. |
| DEC-144 | The privacy policy and the terms name the user, as an individual, as publisher and contact; drafted from what the app and site do; the user approves the final text before launch. |
| DEC-132, DEC-158 | Plain words for a DJ who is not technical; American English; no "engine" or "jobs" (DEC-155). |
| DEC-145, DEC-129, DEC-170, DEC-174, DEC-176 | A download is a release DIST-04 published; macOS is two downloads, Apple Silicon and Intel; Windows and both Macs ship unsigned (DEC-145, DEC-170), so the page says what SmartScreen and Gatekeeper show and how to open the app the first time; Linux is told when a new version is out (DEC-174); every release before 1.0.0 is a test release (DEC-176). |
| DEC-126 | The bug form and the FAQ say the app reports its errors itself and how to turn that off. |
| DEC-140 | This phase runs alone, after Phase 16. |
| DEC-189…DEC-198 | Decision Round 20: the crate becomes the wheel; five themes; sound only on request; Umami Cloud; Web3Forms; no download until 1.0.0; live at the end of this phase; a domain bought before launch; comparison pages; the pixel mark, which DIST-09 already made the app's icon. |

## Sequencing

**The frame first.** SITE-01 makes the Astro project, its CI job and the one address setting.
SITE-02 brings the app's look to the web as tokens and components, and the layout every page must
use. SITE-03 makes DEC-141's checks fail the build, so that every page after it is held by them from
its first commit.

**Then the material.** SITE-04 captures the app's pictures from the real app. SITE-05 builds the 3D
runtime: loading, gating, the pixel look, the still fallbacks and the frame budget, with one small
test scene.

**Then the pages,** each built on SITE-02's layout and held by SITE-03: home (SITE-06), download
(SITE-07), features (SITE-08), guide and FAQ (SITE-09), changelog and blog (SITE-10), privacy, terms
and the 404 (SITE-11), forms and analytics (SITE-12).

**Then the launch.** SITE-13 deploys to GitHub Pages, retires `gh-pages-root/`, verifies the site
with search engines, writes the backlink plan, and runs the checks no machine can: keyboard, screen
reader, a real phone, a live form, the user's approval of the policy text.

**Nothing is public until SITE-13.** Until then each build is a CI artifact with `noindex` on every
page (DEC-141's "preview builds"), and the old page stays live.

## Before starting any step — ten cross-cutting facts

### 1. The site lives under `/CuePoint/`, and that changes with a domain

A project site on GitHub Pages is served at `https://stuchain.github.io/CuePoint/`, so every link and
asset needs the `/CuePoint/` base, and the path is case-sensitive. A custom domain serves it at `/`.
Astro's `site` and `base` both come from the one address setting (DEC-139), so moving changes one
line. A link written as a bare `/guide/` works locally and breaks on Pages; SITE-03's link check
runs against the built site with the base, so it catches that.

### 2. GitHub Pages sets no headers

There are no custom response headers: no `Content-Security-Policy`, no `Cache-Control`, no
redirects. A CSP is a `<meta>` tag. Long caching comes from Astro's hashed file names. A page that
moves leaves a small page with a canonical to the new one and a `noindex`, not a 301.

### 3. Deploying by Actions stops the `gh-pages` branch being served

Pages serves either a branch or what a workflow uploads, not both. The `gh-pages` branch holds more
than the page: the retired Qt app's appcasts (`appcast.xml`, `updates/{macos,windows}/{stable,test}/
appcast.xml`), two old installers (`artifacts/…/CuePoint-v1.0.1…`) and stray `__pycache__` files.
Switching to the Actions deploy stops serving all of them. The retired app's updater then finds
nothing, which DEC-019 and DEC-147 already accept. The branch itself is kept, so nothing is lost.
Switching the Pages source is a setting the user changes once (SITE-13).

### 4. Today's page uses Google Analytics

`gh-pages-root/index.html` loads `gtag.js` (`G-4QM1M6Q2ZT`) behind a consent mode. DEC-142 replaces
it with cookieless analytics. The GA4 property is left for the user to delete; nothing in the new
site loads Google's scripts or fonts.

### 5. The app has no icon of its own (DIST-09 gives it one)

`apps/desktop-electron/package.json` names no icon and there is no `.ico` or `.icns` in the
repository, so the packaged app shows Electron's default. The only mark is `gh-pages-root/logo.svg`,
a green rounded square with a white "C" and cue point, which has none of the app's pixel signature.
DEC-141 makes the favicon "from the app's icon". DEC-198 draws a pixel mark and makes it the app's
icon in Phase 16 (DIST-09), so by this phase the mark exists and the site reuses it.

### 6. The guide is written for the app, in Markdown, with relative links

`docs/user-guide/` has 16 pages linking each other as `library.md`, with no pictures and no front
matter. The site builds from those files where they are (DEC-139). A loader gives each page a
title, description and order from a small table in the site, rewrites `x.md` links to the site's
URLs, and fails the build on a link to a page that does not exist. The files gain no front matter,
so they stay readable on GitHub and in the repository.

### 7. WebGL is where Core Web Vitals are lost

A Three.js bundle is over 150 KB compressed before any scene, shaders compile on the main thread,
and a canvas can be the largest paint. DEC-141's budgets (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on a
mid-range phone) hold only if the first paint is HTML and a still image, the 3D is a dynamic import
started after the page is usable, and the canvas has fixed dimensions. Lighthouse in a lab cannot
measure INP; Total Blocking Time is held as its stand-in (≤ 200 ms), and real INP is read from the
analytics' or Search Console's field data after launch.

### 8. Each scene's still is rendered from the scene

A still drawn by hand drifts from the scene it stands for. SITE-05 renders each scene's still at
build, in headless Chromium with WebGL (SwiftShader), at the scene's resting frame, in each theme the
site offers (DEC-190). If Chromium cannot render WebGL in CI, the still is rendered on a developer
machine and committed, and CI checks it exists and is newer than the scene's source.

### 9. Release data is read at build

The download page shows the newest normal release (DEC-194; none before 1.0.0), with each file's size
and checksum. It reads GitHub's release list at build, not in the visitor's browser (no rate limit,
no layout shift, readable by search engines). DIST-04's release workflow triggers a site deploy
when it publishes, so the page is never older than the newest release. If the read fails, the build
keeps the last good data (committed in `apps/website/src/data/releases.json`) and says so in the
log; it never publishes an empty download page.

### 10. GSAP is free, and the site uses it as a library

GSAP and all its plugins (ScrollTrigger, SplitText, Flip) are free under GreenSock's standard
license since 2025. The site imports them from npm and uses them in plain TypeScript islands.

---

## SITE-01 — The Astro Project, Its CI, and One Address

**Objective**: An Astro project in `apps/website/` that builds a static site, with one setting for
the address, a CI job that type-checks, tests and builds it on every push, and the product context
the design skills read.

**User-visible result**: None yet. A CI artifact holds a built page that says "CuePoint" under
`/CuePoint/`.

**Dependencies**: Phase 16 complete.

**Skills**: `frontend-design`, `impeccable` (to write `PRODUCT.md`), `best-practices`.

**Design**:
- **`apps/website/package.json`:** Astro (latest major), TypeScript in strict mode, Vitest, Three.js
  and GSAP (installed here, used from SITE-05), `@astrojs/sitemap`, and `sharp` for images. The Node
  version is the one `desktop-electron.yml` uses (22). Its own `package-lock.json`; the repository
  has no root workspace and this adds none.
- **`apps/website/site.config.ts`:** the one address setting, `SITE_URL =
  "https://stuchain.github.io/CuePoint/"`. `astro.config.mjs` derives `site` and `base` from it. A
  unit test holds that `base` is the URL's path with a trailing slash and that a custom domain
  (`https://example.com/`) gives `/`.
- **`output: "static"`, `trailingSlash: "always"`, `build.format: "directory"`,** so every page is
  `…/name/index.html` and its URL is the same on Pages and locally.
- **`apps/website/PRODUCT.md`:** the product context `impeccable` reads: what CuePoint is and who it
  is for, the voice (DEC-132, DEC-155, DEC-158), and the look, pointing at
  `docs/v1/PIXEL_DESIGN_SYSTEM.md` and the renderer's tokens as the source of truth. It says the 3D
  extends the app's look and never replaces it.
- **`apps/website/README.md`:** how to run, build, preview and check the site.
- **`.github/workflows/website.yml`:** on pushes and pull requests touching `apps/website/**`,
  `docs/user-guide/**`, `docs/release/CHANGELOG.md` or the workflow: `npm ci`, `npm run check`
  (`astro check` and `tsc --noEmit`), `npm test`, `npm run build`, and the built `dist/` uploaded as
  an artifact. No deploy job yet (SITE-13).
- **Every page carries `noindex` until SITE-13** through one flag in `site.config.ts`
  (`PUBLIC = false`), so a preview that escapes is never indexed.
- **`.gitignore`:** `apps/website/node_modules/`, `dist/`, `.astro/`.

**Tests**:
- `apps/website/src/site.config.test.ts`: the address gives the right `site` and `base`, for the
  Pages address and for a custom domain.
- CI: `website.yml` runs green on the commit.

**Acceptance criteria / DoD**:
- `npm ci && npm run check && npm test && npm run build` pass in `apps/website`.
- `dist/index.html` exists, carries `noindex`, and its links start with `/CuePoint/`.
- `website.yml` passes on the push.
- Nothing outside `apps/website/`, `.github/workflows/website.yml` and `.gitignore` changes.

**Risks**: Low.

**Complexity**: **S**

**Outcome (2026-10-08, built early by DEC-212)**: Astro 7.3 in `apps/website/` with
`astro.config.ts` (not `.mjs`, so it is type-checked) deriving `site` and `base` from
`site.config.ts`; `PUBLIC = false` puts `noindex` on every page; TypeScript is held at 6 because
`@astrojs/check` 0.9 does not accept 7 yet; Node 22.12 or newer. `website.yml` runs check, test and
build and uploads `dist/`. `PRODUCT.md` written for the design skills.

---

## SITE-02 — The App's Look on the Web, and the Layout Every Page Uses

**Objective**: The site's tokens come from the app's tokens; a small set of components draws the
pixel chrome; and one layout makes a page impossible to build without its title, description,
canonical, social tags and schema.

**User-visible result**: None yet (a style page in the preview build shows every component in every
theme).

**Dependencies**: SITE-01.

**Skills**: `impeccable` (critique and polish of the components), `frontend-design`,
`accessibility`.

**Design**:
- **Tokens generated, not copied.** `apps/website/scripts/sync-tokens.mjs` reads
  `apps/desktop-electron/renderer/src/tokens/tokens.css` and `themes/*.css` and writes
  `apps/website/src/styles/tokens.generated.css`, with `--scale` fixed for the web (sizes in `rem`,
  so the visitor's text size is honored). It resolves the app's `round()`, `max()` and `@property`
  values (PAGES-14's hairline and row height) for the fixed scale, rather than copying them. `npm run build` runs it first. A test fails if the
  generated file differs from what the app's tokens give, so the site cannot drift from the app.
- **Themes (DEC-190):** all five themes, Neo Dark by default, chosen from a pixel switch in
  the header, kept in `localStorage` (wrapped, so a blocked store just means Neo Dark), applied
  before first paint by a tiny inline script so there is no flash. The 3D reads the same palette
  (SITE-05).
- **Fonts, self-hosted:** Pixelify Sans (OFL) for headings, navigation and buttons; one readable
  sans for long prose (the guide and the blog), chosen in this step with `impeccable` and recorded in
  `PRODUCT.md`, also self-hosted. `font-display: swap`, the heading font preloaded, metric overrides
  on the fallback so the swap does not shift the layout. No Google Fonts request.
- **Components** (`apps/website/src/components/`), each square-cornered, black-outlined, beveled,
  with hard zero-blur shadows as the app's are: `Button` (primary, secondary, and a link styled as
  one), `Panel`, `Badge`, `Section`, `Header` (logo, navigation, theme switch, **Download**), `Footer`
  (every page linked, the publisher's name, the privacy and terms links), `Img` (wraps Astro's
  `<Image>`; `alt` is required, and `alt=""` needs `decorative` set, so missing alt text fails type
  checking), `Breadcrumbs`, `Callout`, `Kbd`, `CodeBlock`.
- **`src/layouts/Page.astro`,** the only page layout. Its props are typed and required: `title`,
  `description`, `path`; optional `ogImage`, `schema` (JSON-LD objects), `breadcrumbs`, `noindex`
  (allowed only for the 404 and thank-you pages, by type). It writes the `<title>`, the meta
  description, the canonical from the address setting, Open Graph and X card tags, the JSON-LD,
  `lang="en"`, the skip link, the header and footer, and the CSP `<meta>` (fact 2).
- **Focus and motion:** a visible focus ring in the theme's accent on every interactive element;
  `prefers-reduced-motion` turns off every transition, fades included, as the app does (PAGES-02).
- **`/styleguide/`** in preview builds only (excluded from the production build and the sitemap):
  every component in every theme, for review.

**Tests**:
- `scripts/sync-tokens.test.mjs`: the generated tokens match the app's for each theme; a token added
  to the app appears; a theme removed from the app disappears.
- `src/components/*.test.ts` (Astro's container API): `Img` without `alt` fails `astro check` (a
  fixture); `Button` renders a real `<a>` or `<button>`; `Page` without `title` or `description`
  fails `astro check` (a fixture).
- `src/layouts/Page.test.ts`: the canonical is the address plus the path; the OG URL equals it;
  JSON-LD is emitted as given.

**Acceptance criteria / DoD**:
- The checks above pass; `npm run build` passes.
- `/styleguide/` reviewed with `impeccable`'s critique, and its findings fixed or recorded.
- Every component's text and focus ring has at least 4.5:1 contrast in every theme (axe, SITE-03).

**Risks**: Medium. The app's tokens are written for the app's size steps; the web needs fluid type.
The generator converts sizes, and the test pins it.

**Complexity**: **M**

**Outcome (2026-10-08)**: `scripts/sync-tokens.mjs` generates `tokens.generated.css` from every CSS
file in the app's tokens folder at a web scale of 1.25 (body text 17.5 px), hairlines in whole px
rounded down as the app does, PAGES-14's `round()`/`max()`/`@property` resolved; a drift test fails
when the app's tokens change, and `website.yml` also runs on changes to them. Prose font: Atkinson
Hyperlegible Next; Pixelify Sans for chrome, ligatures off. Fonts are self-hosted through Astro's
Fonts API with local files. The mark is DIST-09's 32 px grid, re-encoded as one path per color and
tested pixel-identical. `Page.astro` types `noindex` as `"404" | "thank-you"`; `Img` needs `alt` or
`decorative`. The publisher shows as "stuchain" until the user's name is given (DEC-144, SITE-11).
Contrast: black text on accent fills (the app's inverse text fails in Neo Dark), and the focus ring
has a text-colored halo. `@playwright/test` is pinned at 1.56.1 to match the container's Chromium.

---

## SITE-03 — DEC-141's Checks, Failing the Build

**Objective**: Every DEC-141 item a machine can check is checked on the built site in CI, and a
break fails the job.

**User-visible result**: None.

**Dependencies**: SITE-02.

**Skills**: `web-quality-audit`, `seo`, `accessibility`, `core-web-vitals`, `performance`.

**Design**:
- **`apps/website/scripts/check-site.mjs`,** run on `dist/` after the build (`npm run check:site`),
  reading every HTML file. It fails, naming the page, when:
  - a page has no `<title>`, no meta description, or no canonical, or two pages share a title or a
    description;
  - a title is over 60 characters or a description is outside 70–160;
  - a page has no `h1` or more than one, or a heading skips a level;
  - an `<img>` has no `alt` attribute;
  - a page carries `noindex` and is not the 404, a thank-you page, or a preview build (DEC-141,
    Q-145); or a page in the sitemap carries `noindex`; or an indexable page is missing from the
    sitemap;
  - an internal link or asset does not resolve inside `dist/` with the base (fact 1);
  - any `href` or `src` is `http://` (DEC-141's HTTPS row);
  - a JSON-LD block does not parse, or a `SoftwareApplication`, `Organization`, `WebSite`,
    `FAQPage`, `BlogPosting` or `BreadcrumbList` block lacks the properties Google's rich results
    require for its type (a table in the script, with its source dated);
  - a page has no `og:image`, or the image is missing from `dist/`;
  - the favicon set or `site.webmanifest` is missing;
  - `robots.txt` does not name the sitemap.
- **Accessibility and widths, in a browser:** `apps/website/e2e/a11y.spec.ts` (Playwright, Chromium)
  serves `dist/` and opens every page at 375, 768 and 1440 px wide. On each: axe-core with the WCAG
  2.2 AA rules and no violation allowed; no horizontal scroll; every tap target at least 24×24 px.
- **Speed:** Lighthouse CI (`@lhci/cli`, `lighthouserc.json`) on the home, download, a guide page
  and a blog post, mobile emulation, three runs each, asserting LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1,
  and performance, accessibility, best practices and SEO scores ≥ 95. A JavaScript budget per page:
  ≤ 50 KB compressed before the 3D loads.
- **External links:** `lychee` checks every external link on a weekly schedule and on demand
  (`website-links.yml`), so a site elsewhere being down never blocks a push; a dead link opens an
  issue.
- **All wired into `website.yml`,** after the build, each as its own step so a failure names the
  check.

**Tests**:
- `scripts/check-site.test.mjs`: a fixture `dist/` per rule with exactly one fault, each failing with
  that rule's message, and one clean fixture passing.
- The checks pass on SITE-02's build.

**Acceptance criteria / DoD**:
- Each rule above has a failing fixture and the clean fixture passes.
- `website.yml` runs every check, and passes on the push.

**Risks**: Medium. Lighthouse in CI varies run to run; three runs and the median keep it steady. If a
budget flaps, the run count rises, never the budget.

**Complexity**: **M**

**Outcome (2026-10-08)**: `scripts/check-site.mjs` holds 24 rules with a one-fault fixture each,
plus canonical-is-own-address, sitemap locs that must resolve, noindex required on every preview
page, and relative links refused on the 404. Results carry a severity: a `SoftwareApplication`
without a rating or review is a warning, not a failure, since Google needs one for the rich result
and CuePoint has none to give (never invented). `e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA) on every
page at 375, 768 and 1440 px and in all five themes at 1440, with no horizontal scroll and 24 px
targets. Lighthouse CI asserts the budgets with `is-crawlable` skipped while previews are
`noindex`; a test fails if the skip outlives `PUBLIC = false`. The 50 KB script budget is a total
cap; SITE-05 adds the before-the-3D measure. `website-links.yml` checks external links weekly and
keeps one issue open. Favicons reuse DIST-09's `icon.ico` and 512 px PNG.

---

## SITE-04 — The App's Pictures, Taken From the App

**Objective**: Every screenshot of the app on the site is captured by a script from the real app,
with a made-up library, in each theme the site offers, so the pictures can be retaken in one command
whenever the app changes.

**User-visible result**: None yet (the pictures appear from SITE-06).

**Dependencies**: SITE-01. Phases 14 and 15 complete, so the pictures show the revisited pages and
Statistics.

**Skills**: `performance` (image formats and sizes).

**Design**:
- **A made-up library:** `apps/desktop-electron/e2e/fixtures/showcase/`, a Rekordbox XML of about 300
  tracks with invented artists, titles and labels (no real name), plausible keys, tempos, genres,
  years, ratings, play counts and cue points, with Collections and Sets, and short generated audio
  files so the waveforms draw. Beatport is stubbed with invented matches, as the Phase 14 reviews were
  taken, and the matches carry the keys: since DEC-201 a track's key is its accepted match's, so a
  fixture with keys only in its XML would show "No Beatport key" everywhere and light no wheel. A test holds that no name in it matches a list of real artists and labels the script ships.
- **`apps/desktop-electron/e2e/capture/showcase.spec.ts`,** run only by `npm run capture:showcase`
  (excluded from the normal suite): opens the app on that library and takes a fixed list of shots,
  each named in `apps/website/src/assets/app/shots.json` (Library with Track details, Clean
  mid-match, Clean's comparison, the Keys page, Prepare's Set, Statistics, the Camelot wheel open, the player with a
  waveform, the Rekordbox export), at the app's default size (DEC-161), in each theme.
- **Output:** PNG into `apps/website/src/assets/app/<shot>-<theme>.png`, committed. Astro makes
  AVIF and WebP at the sizes each page asks for. The capture also writes each shot's `alt` text
  draft into `shots.json`, reviewed by hand once.
- **Short clips (optional per shot):** a few seconds of the app moving (the wheel lighting, a match
  landing) as muted, looping WebM and MP4, only where a still cannot show it, each with a poster frame
  and paused under reduced motion.

**Tests**:
- `apps/website/src/assets/app/shots.test.ts`: every shot in `shots.json` has a file in every theme,
  and every file is in `shots.json`.
- The showcase fixture's name test.

**Acceptance criteria / DoD**:
- `npm run capture:showcase` in `apps/desktop-electron` produces every listed shot on Windows (the
  user's PC, through Remote Control) or Linux.
- The pictures and `shots.json` are committed, and the tests pass.
- No shot shows a real person's name, a real path or a real library.

**Risks**: Medium. The app's pages change after this phase; the capture is one command so the
pictures follow.

**Complexity**: **M**

---

## SITE-05 — The 3D Runtime: Loading, the Pixel Look, Stills and the Frame Budget

**Objective**: One small runtime that every scene uses: it loads after the page is usable, draws in
the app's pixel style, follows the scroll, stays within a frame budget, cleans up after itself, and
shows the scene's still whenever 3D should not run.

**User-visible result**: None yet (a test scene in the preview build).

**Dependencies**: SITE-02, SITE-03.

**Skills**: every `threejs-*` skill; `gsap-core`, `gsap-scrolltrigger`, `gsap-performance`;
`core-web-vitals`, `performance`.

**Design**:
- **`src/three/Stage.ts`:** one renderer per page, reused by each scene on it. `<Scene name="…">` in
  a page renders the still as an `<img>` with fixed width and height, and the canvas is added over it
  only when the scene starts.
- **When a scene starts:** after the `load` event and an idle callback, when its section is within
  one viewport of the screen (IntersectionObserver), by a dynamic `import()`. It never starts when:
  - WebGL 2 is unavailable or the context fails;
  - `prefers-reduced-motion: reduce` is set;
  - `navigator.connection.saveData` is on;
  - the device reports `deviceMemory` < 4 or `hardwareConcurrency` < 4;
  - the first two seconds run below 30 fps (it then stops and the still stays).

  In each case the still is the scene, and nothing on the page depends on the 3D to be read or used.
- **The pixel look, as code:**
  - a render target at a fraction of the canvas size, scaled up with nearest-neighbor filtering, so
    the pixels are real pixels at every screen size;
  - a palette pass that snaps colors to the active theme's palette (uniforms read from the CSS
    tokens), so a theme change recolors the scene (DEC-190);
  - an outline pass in `--border-outline` black, and hard, unblurred shadows;
  - voxel helpers: instanced cubes (`InstancedMesh`) and pixel textures with `NearestFilter`.
- **Scroll:** GSAP ScrollTrigger drives each scene's timeline with `scrub`, so the camera and the
  objects follow the scroll and stop when it stops. The scene pauses its render loop when off screen
  and when the tab is hidden.
- **Frame budget:** device pixel ratio capped at 2, lowered while frames run long; shaders compiled
  during idle before the section is reached (`renderer.compile`); textures and geometry disposed when
  the page is left.
- **The stills:** `npm run stills` renders each scene's resting frame in headless Chromium, in each
  theme, to `src/assets/stills/<scene>-<theme>.png` (fact 8), and Astro serves them as AVIF and WebP.
- **Keyboard and screen readers:** the canvas is `aria-hidden`, and the section's text says what the
  scene shows. Nothing is only in the 3D.
- **A test scene** (`/styleguide/three/`, preview only): a voxel cube field that rises with the
  scroll, used by the checks below.

**Tests**:
- `src/three/gate.test.ts`: each condition above stops the start, and all clear starts it.
- `src/three/palette.test.ts`: the palette uniforms equal the theme's tokens, for each theme.
- `e2e/three.spec.ts` (Playwright): with WebGL the canvas appears and the still stays under it; with
  WebGL disabled, with reduced motion, and with `saveData`, no canvas, and the still is shown; after
  leaving the page, the WebGL context is released.
- Lighthouse on the test page: the budgets of SITE-03 hold with the scene.

**Acceptance criteria / DoD**:
- The tests pass; the test page meets the budgets on Lighthouse's mobile emulation.
- On the user's PC and a real mid-range phone, the test scene runs at 60 fps on the PC and at least
  30 fps on the phone, or falls back to its still.

**Risks**: High. This is where the site is slow or not. The gate and the budget are tested before any
real scene exists.

**Complexity**: **L**

---

## SITE-06 — Home

**Objective**: The page that makes a DJ stop scrolling and understand, in one screen, what CuePoint
does for them, then shows it, then offers the download.

**User-visible result**: The home page, in the preview build.

**Dependencies**: SITE-04, SITE-05.

**Skills**: `impeccable` (critique, polish, animate), `frontend-design`, `threejs-*`,
`gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins` (SplitText for the headline), `seo`.

**Design**:
- **Above the fold:** the headline (`h1`) saying what the app does for a DJ in plain words, one
  sentence under it, **Download for <system>** (SITE-07's detection; one primary action, DEC-141;
  "Get notified of 1.0" until 1.0.0, DEC-194),
  a secondary **See how it works** that scrolls, and the opening scene's still.
- **The opening scene (DEC-189): the crate becomes the wheel.** A voxel record crate
  with mismatched, unlabeled records. As the visitor scrolls, the records lift out, get their tags
  (key, tempo, genre) as pixel labels, and fly into a 3D Camelot wheel that lights in the app's
  colors; the wheel then turns flat and becomes the real app's window (SITE-04's shot). It tells the
  product's story in one movement: a messy library, matched, organized, ready for the booth.
- **Then one section per thing the app does,** each a short heading, two or three sentences, the
  app's picture and, where it earns it, a small scene: Clean (match tracks to Beatport, fix values,
  find duplicates), the Library (filters, the wheel), Keys (the keys of your playlists), Discover
  (new music from Beatport), Prepare (Sets), Statistics, and the export back to Rekordbox. Each links to its feature page (SITE-08).
- **Trust:** free, runs on your computer, your library stays yours, open source on GitHub, works with
  Rekordbox's XML. Each claim checked against the app and the privacy notice.
- **Sound (DEC-191):** a pixel speaker button, off by default, plays a short loop and the
  voxels move to it (Web Audio's analyser). The button is hidden until the loop file exists; no
  sound ever plays unasked.
- **Schema:** `SoftwareApplication` (name, operating systems, category `MultimediaApplication`, price
  0, download URL, screenshot), `Organization`, `WebSite`.

**Tests**:
- `e2e/home.spec.ts`: the `h1` and the primary button are visible without scrolling at every width;
  the primary button names the detected system (SITE-07); with reduced motion, every section's still
  is shown and no canvas is made.
- SITE-03's checks and budgets pass on the page.

**Acceptance criteria / DoD**:
- The tests and SITE-03's checks pass, including Lighthouse's budgets with the opening scene.
- `impeccable`'s critique run on the page and its findings fixed or recorded.
- The user has seen the preview and approves the page (a link to the preview build in the thread).

**Risks**: High. It carries the "how did he make this" reaction. The approval is the gate.

**Complexity**: **L**

---

## SITE-07 — Download

**Objective**: The right download in one click for the visitor's system and chip, every other
download one more click away, and honest words about what happens after.

**User-visible result**: The download page, and the system named on every **Download** button.

**Dependencies**: SITE-02, SITE-03. Phase 16's DIST-03 and DIST-04.

**Skills**: `seo`, `accessibility`, `frontend-design`.

**Design**:
- **Release data at build** (fact 9): `scripts/fetch-releases.mjs` reads the release list, picks
  the newest normal release (test releases are never offered on the site, DEC-194; until 1.0.0
  every release is a test release, DEC-176, so there is none yet), and writes `src/data/releases.json` with each file's name, size,
  SHA-256 and URL. It reuses DEC-145's precedence (a small copy of DIST-05's compare, tested against
  the same examples).
- **Before 1.0.0** (DEC-194): the page says 1.0.0 is coming and what CuePoint will run on, and
  links GitHub's releases page for anyone who wants a test build. Every page's primary action is
  "Get notified of 1.0", which opens the repository's page where a visitor can watch its releases.
  When the data holds a normal release, everything below turns on by itself.
- **Detection (the roadmap's proposal), in the browser, after the page is shown:**
  `navigator.userAgentData.getHighEntropyValues(["platform", "architecture", "bitness"])` where
  offered, the user agent otherwise. Windows → the Windows installer. A Mac → Apple Silicon when
  detected or unknown (Safari does not say the chip), with **Intel Mac?** beside it. Linux → the
  AppImage. A phone or tablet → "CuePoint runs on Windows, macOS and Linux" with a **Send me the
  link** share button, no download. The page renders a neutral **Download** first, so detection
  never shifts the layout.
- **Every download listed** below, by system and chip, with size, checksum, and the release notes'
  link.
- **What happens next,** per system: Windows' SmartScreen warning and how to get past it (DEC-145
  ships unsigned); the Mac's first open of an unsigned app, with the quarantine step the user guide
  gives (DEC-170); making the AppImage runnable; that the app updates itself on Windows and macOS
  (DEC-145, DEC-169, DEC-170) and says when a new version is out on Linux (DEC-174).
- **The system requirements,** from `docs/user-guide/getting-started.md`.
- **Analytics:** each download click is counted as an event with the system and chip (SITE-12).
- **The deploy on release:** DIST-04's workflow gains one step that triggers `website.yml`'s deploy
  (`workflow_dispatch`) after a release is published (SITE-13 wires it).

**Tests**:
- `scripts/fetch-releases.test.mjs` with a recorded release list: drafts, test releases and files
  outside DIST-03's names skipped; a list with only test releases gives "none yet"; a failed read
  keeps the last data and fails nothing.
- `e2e/download.spec.ts` also runs against a recorded list with no normal release: the page says
  1.0.0 is coming, links GitHub's releases, and shows no download button.
- `src/lib/detect.test.ts`: each user agent and client-hints answer in a table maps to its download,
  including an Apple Silicon Mac in Chrome, a Mac in Safari, Windows on Arm (offered x64, said so),
  an iPhone and an Android phone.
- `e2e/download.spec.ts`: no layout shift when detection runs; every listed file's link is the
  release's URL.

**Acceptance criteria / DoD**:
- The tests and SITE-03's checks pass.
- The page's files match the newest release on GitHub at build time.

**Risks**: Medium. Detection is a guess on Macs; the Intel link is always beside it.

**Complexity**: **M**

---

## SITE-08 — Features

**Objective**: A page for each thing the app does, each written for a search a DJ would make, and a
features overview linking them.

**User-visible result**: `/features/` and one page per feature.

**Dependencies**: SITE-04, SITE-05, SITE-06.

**Skills**: `impeccable`, `seo`, `gsap-scrolltrigger`; `threejs-*` where a page has a scene.

**Design**:
- **Pages** (each a heading, the problem in the DJ's words, how CuePoint solves it, the app's
  pictures, what it does not do, and links to its guide page and the download):
  - **Clean:** match Rekordbox tracks to Beatport for key, tempo, label, genre and release date; fix
    values in bulk, find duplicates, check files;
  - **The Library:** filters, columns, the Camelot wheel and compatible keys;
  - **Keys:** the keys of one or several playlists on the Camelot wheel;
  - **Discover:** new music from artists, labels and charts on Beatport;
  - **Prepare:** build Sets for a gig;
  - **Statistics:** most played, never played, how the library spreads;
  - **Waveforms and the player;**
  - **Export to Rekordbox:** what comes back into Rekordbox, and how.
- **Words for search:** each page's title and description are written for one query a DJ types
  ("fix Rekordbox key tags", "find duplicate tracks Rekordbox", "Camelot wheel harmonic mixing
  Rekordbox"), listed in `apps/website/docs/content-plan.md` with the page that answers it. No two
  pages aim at the same query.
- **Comparison pages (DEC-197):** `/compare/<tool>/` for Lexicon, Mixed In Key, rekordcloud and any
  other the user names: what
  each does, side by side, every fact about the other tool linked to its own public page and dated,
  and what CuePoint does not do. Reviewed by the user before launch.
- **Schema:** `BreadcrumbList` on each; `SoftwareApplication`'s `featureList` on the overview.
- **Internal links:** each feature page links to two related ones, its guide page and the download
  (DEC-141's internal links).

**Tests**:
- SITE-03's checks pass on every page.
- `src/content/features.test.ts`: every feature page's query in `content-plan.md` is unique, and each
  page links its guide page.

**Acceptance criteria / DoD**:
- The checks and tests pass; every claim on every page checked against the app and the user guide,
  with any found wrong fixed in the page.
- `impeccable`'s critique run on the overview and one feature page.

**Risks**: Low.

**Complexity**: **M**

---

## SITE-09 — The Guide and the FAQ

**Objective**: The user guide on the site, built from `docs/user-guide/` as it stands, and an FAQ
that answers what a new visitor asks.

**User-visible result**: `/guide/` with its 16 pages, and `/faq/`.

**Dependencies**: SITE-02, SITE-03.

**Skills**: `seo`, `accessibility`, `frontend-design`.

**Design**:
- **A content loader** (Astro content layer, `glob` over `../../docs/user-guide/*.md`) with a table in
  `src/content/guide.ts` giving each page its title, description, order and section (fact 6). The
  build fails if a guide file has no row or a row has no file.
- **Links:** `x.md` and `x.md#part` become the guide's URLs; a link to a missing page or heading fails
  the build. Links outside the guide (to the repository) become GitHub links.
- **The guide's page:** a sidebar of every page in order, "On this page" from the headings, previous
  and next, breadcrumbs, an **Edit on GitHub** link, and the prose font from SITE-02.
- **Search inside the guide:** Pagefind, built at build, loaded only when the search box is
  focused.
- **`support-policy.md`** goes in the guide's last section, not the main list.
- **The FAQ:** `src/content/faq.yaml`, questions a new visitor asks (is it free, does it change my
  Rekordbox library, what it needs, Mac chips, what it sends and how to turn that off (DEC-126), how
  updates work (DEC-145), where my data is, how to report a problem), each answer short and linking
  the guide. `FAQPage` JSON-LD from the same file.
- **No word changes in `docs/user-guide/`** in this step. A sentence found wrong or unclear for the
  site is listed in the step's outcome for a docs change of its own.

**Tests**:
- `src/content/guide.test.ts`: every file has a row; links rewrite as above; a fixture with a broken
  link fails.
- SITE-03's checks pass on every guide page, the FAQ included (its `FAQPage` schema).

**Acceptance criteria / DoD**:
- All 16 pages build, link each other, and pass the checks.
- Pagefind finds a word from each page.

**Risks**: Low. The guide's text is the app's; the site only presents it.

**Complexity**: **M**

**Outcome (2026-10-08)**: `/guide/` and its 16 pages are built from `docs/user-guide/*.md` where they
are (unchanged). Astro 7 renders Markdown with Sätteri, so the link rewriter is an mdast plugin, not
a remark one. `src/content/guide.ts` gives each page its title, description, order and section; the
build fails on a file with no row, a row with no file, a link to a missing page, heading or
repository file, an image, or a raw HTML link. Links out of the guide go to GitHub on the `feature`
branch (`GITHUB_BRANCH` in `site.ts`). Each page has a sidebar, "On this page", previous and next,
breadcrumbs, Edit on GitHub, and Pagefind search that loads only when the box is focused (its index
is built after `astro build`; its unused UI files are removed). `/faq/` has nine answers from
`faq.yaml`, with `FAQPage` JSON-LD from the same file; the answers describe the app today (no
updater yet). A Playwright test finds a word unique to each guide page through the real search box.
Sentences found for **a docs change of their own** (none edited here): `support-policy.md:18` and
`features.md:114` say an Intel Mac build is "planned" (DEC-129 ships both chips);
`getting-started.md` ("does not update itself yet") and `troubleshooting.md` ("No in-app updates")
must change when DIST-06 lands, and the FAQ's updates answer with them; the page titles (H1)
mix title case ("Getting Started", "Performance and Scalability") with sentence case ("Your
library"); and
`support-policy.md` and `performance.md` use words meant for the repository (CI workflow names,
`python main.py`, "Design 6.63", error codes) on a DJ-facing site.

---

## SITE-10 — The Changelog and the Blog

**Objective**: The changelog on the site from `CHANGELOG.md`, and a blog that is easy to write in,
shares well and feeds readers.

**User-visible result**: `/changelog/`, `/blog/` with its first post, and `/blog/rss.xml`.

**Dependencies**: SITE-02, SITE-03.

**Skills**: `seo`, `frontend-design`, `impeccable`.

**Design**:
- **The changelog:** `docs/release/CHANGELOG.md` parsed by version, each version its own anchor and
  date, the newest first, **Unreleased** shown only in preview builds. Each version links its GitHub
  release. The download page links the newest.
- **The blog:** a content collection in `apps/website/src/content/blog/`, one Markdown file per
  post, with typed front matter (title, description, date, author, image and its alt, tags). The
  build fails on a missing field.
- **Each post:** `BlogPosting` and `BreadcrumbList` JSON-LD, its own OG image (SITE-12's generator),
  reading time, share links (X, Bluesky, Reddit, copy link) as plain links with no third-party
  script, and links to two related posts or features.
- **The feed:** RSS (`@astrojs/rss`), linked from every page's head.
- **The first post:** "Introducing CuePoint", written in this step from the app as it is, approved by
  the user before launch.

**Tests**:
- `src/content/changelog.test.ts`: a fixture changelog parses into versions with dates; Unreleased is
  dropped from production.
- SITE-03's checks pass on the changelog, the blog index and the post; the feed validates as RSS 2.0.

**Acceptance criteria / DoD**:
- The checks and tests pass, and the user approves the first post.

**Risks**: Low.

**Complexity**: **S**

**Outcome (2026-10-08)**: `/changelog/` parses `CHANGELOG.md` strictly (a duplicate or unreadable
version heading fails the build) and, in production, shows only the new app's normal versions,
1.0.0 and later (DEC-176, DEC-194); today that is none, so it says 1.0 is coming and links GitHub
Releases. A version links its release only when the release exists. `/blog/` with typed front
matter, `BlogPosting` (publisher a Person, DEC-144), `og:type` article, share links with no
third-party script, and `/blog/rss.xml` linked from every page and checked by `check-site`.
"Introducing CuePoint" is written and stays a draft until the user approves it. The body font is
preloaded, which fixed a layout shift on long pages.

---

## SITE-11 — Privacy, Terms, the 404, and the Sharing Pictures

**Objective**: The privacy policy and terms the user approves (DEC-144), a 404 in the site's style,
and every page's OG image, favicons and manifest.

**User-visible result**: `/privacy/`, `/terms/`, the 404, and a picture whenever a page is shared.

**Dependencies**: SITE-02, SITE-03; DIST-09's mark (DEC-198).

**Skills**: `impeccable`, `seo`, `best-practices`.

**Design**:
- **Privacy:** one page covering the site and the app, drafted from what each actually does: the
  site's analytics (Umami Cloud, DEC-192, what it counts, no cookie, DEC-142), the forms (Web3Forms, DEC-193, what is sent and to
  whom, DEC-143), the app's error reports (DEC-126, what is scrubbed, DEC-127, the switch, DEC-128),
  the updater's requests to GitHub (DEC-145), where the app keeps data, the publisher and contact
  (DEC-144). It agrees with `PRIVACY_NOTICE.md` and `docs/policy/privacy-notice.md` and says the
  same; a test compares their headings' facts (see Tests).
- **Terms:** from `docs/policy/terms-of-use.md` and the license, for the site and the downloads.
- **Both carry a "last updated" date** and are approved by the user before launch (DEC-144).
- **The 404:** in the site's style, with a small voxel scene's still (or the scene, gated), the guide
  search, and the main links; `noindex`.
- **The mark (DEC-198):** DIST-09's pixel mark, already the app's icon, is reused as it is. The
  favicon set (`favicon.ico` 16/32/48, `icon.svg`, `apple-touch-icon.png` 180, the manifest's 192 and
  512) and `site.webmanifest` are generated from its SVG source at build. Nothing new is drawn.
- **OG images:** generated at build for every page (`satori` and `resvg`, 1200×630), in the pixel
  style: the page's title in Pixelify Sans on the theme's panel, the mark, and the page's app
  picture where it has one. Each page's `og:image` and `twitter:image` point at its own.

**Tests**:
- `src/pages/privacy.test.ts`: the policy names the analytics service, the form service, Sentry and
  the publisher, and each of these is also named in `PRIVACY_NOTICE.md`.
- `scripts/og.test.mjs`: every page in `dist/` has an OG image of 1200×630.
- SITE-03's checks pass, the favicon and manifest rows included.

**Acceptance criteria / DoD**:
- The checks and tests pass.
- The user approves the privacy text and the terms text (asked in the thread, before SITE-13).

**Risks**: Low in code. The policy text is the user's to approve.

**Complexity**: **M**

---

## SITE-12 — The Forms and the Analytics

**Objective**: The contact and bug-report forms working through the form service, tested, and
cookieless analytics counting visits, sources and downloads, with the consent component standing by.

**User-visible result**: `/contact/` and `/report-a-bug/`, each with a thank-you page; downloads and
visits counted.

**Dependencies**: SITE-02, SITE-03, SITE-07; DEC-192, DEC-193.

**Skills**: `accessibility`, `best-practices`, `performance`.

**Design**:
- **The forms** (DEC-143), each a plain HTML form that posts to the service (Web3Forms, DEC-193), so it works with no script; a small script adds inline validation and sends it in
  the background, then shows the thank-you page.
  - **Contact and feedback:** name (optional), email, subject (feedback, a question, other),
    message.
  - **Bug report:** email, the app's version (a field with the format `X.Y.Z` or `X.Y.Z-test.N`, and
    where to find it: Settings › About & updates), system and chip (choices), what happened, what
    was expected, steps. It says, above the fields, that the app reports its own errors (DEC-126)
    and that **Report a problem** in the app (DEC-152) attaches the last report's id.
  - **Spam:** a hidden honeypot field, a minimum fill time, and the service's own filter; no puzzle
    (DEC-143).
  - **Errors:** each field's message under it, linked by `aria-describedby`; the first invalid field
    focused; a send failure keeps what was typed and offers the email address.
  - **The access key** for the service is public by design (it identifies the inbox, not a secret),
    lives in `site.config.ts`, and is restricted to the site's domain in the service's settings.
- **Analytics** (DEC-142; Umami Cloud, DEC-192): its script, loaded `defer`, after
  consent is not needed (it sets no cookie). Counted: page views, referrers, and events for each
  download (system and chip), each form sent, the theme switch and the sound button. No personal
  data in any event.
- **The consent component** (DEC-142): built, off. A check at load lists the page's cookies; if any
  is not on an allow list (empty today), the banner turns on and nothing non-essential runs until
  the visitor chooses. A test sets such a cookie and sees the banner.

**Tests**:
- `e2e/forms.spec.ts` against a local stand-in for the service: each field's validation and message;
  the honeypot drops the send; a send failure keeps the text; success reaches the thank-you page;
  the form works with scripts off.
- One live send of each form against the service's test or a real inbox, in a manual workflow run
  (`website-forms-live.yml`, `workflow_dispatch`), not on every push.
- `e2e/analytics.spec.ts`: a download click sends one event with the system and chip; no cookie is
  set by any page; the consent banner appears only when a non-allowed cookie is planted.

**Acceptance criteria / DoD**:
- The tests pass; the live run delivers both forms to the user's inbox.
- The thank-you pages carry `noindex` and are not in the sitemap.

**Risks**: Low. The service is the one outside dependency; the stand-in keeps CI independent of it.

**Complexity**: **M**

---

## SITE-13 — Deploy, Launch, and the Checks No Machine Can Make

**Objective**: The site goes live on GitHub Pages from a workflow, the old page and its publishing
retire, search engines are told, the backlink plan is written, and every DEC-141 row is ticked with
its evidence.

**User-visible result**: The new site at the address.

**Dependencies**: SITE-01…SITE-12; the user's approvals in SITE-06, SITE-10 and SITE-11; the
user's domain (DEC-196).

**Skills**: `web-quality-audit`, `seo`; Claude SEO on the user's PC.

**Design**:
- **Deploy:** `website.yml` gains a deploy job (`actions/upload-pages-artifact`,
  `actions/deploy-pages`) on pushes to `feature`, and to `main` once v1 is there (DEC-195), after every check passes, and on
  `workflow_dispatch` (fact 9). `PUBLIC` becomes true in the deploy build only, so preview artifacts
  keep `noindex`.
- **The user switches Pages' source to GitHub Actions** (repository Settings › Pages), once; the
  thread says so when the step is ready (fact 3). The user's domain (DEC-196) is set the same way:
  its DNS records at the registrar and Pages' custom domain with **Enforce HTTPS**; `SITE_URL`
  changes to it in the same commit, and `public/CNAME` names it.
- **Retired:** `gh-pages-root/`, `.github/workflows/publish-gh-pages-site.yml`, and
  `scripts/publish_feeds.py` with its tests, once the new site is live (DEC-139). The `gh-pages`
  branch is kept as it is.
- **The release triggers a deploy:** DIST-04's release workflow dispatches `website.yml` after it
  publishes, so the download page updates by itself.
- **Search engines** (DEC-141): Google Search Console and Bing Webmaster Tools verified by the meta
  tags the user copies from each (the codes go in `site.config.ts`), the sitemap submitted in both.
  Verified by DNS on the user's domain (DEC-196).
- **The backlink plan:** `apps/website/docs/backlinks.md`, where CuePoint belongs (DJ forums and
  subreddits, Rekordbox communities, software directories, launch sites, GitHub topics and awesome
  lists, DJ blogs and YouTube reviewers) and what is offered at each. The user carries it out
  (DEC-141).
- **The checks no machine can make,** each recorded in the step's outcome with what was seen:
  - the whole site by keyboard alone and with a screen reader (NVDA on the user's PC through Remote
    Control, VoiceOver if a Mac is at hand);
  - the home page and download on a real mid-range phone, with the 3D running or falling back;
  - each form sent live and received;
  - Claude SEO's `/seo audit` on the live site, from the user's PC, its findings fixed or recorded;
  - Search Console's first crawl with no error on any page.
- **DEC-141's table, ticked:** `apps/website/docs/launch-checklist.md` lists every row with its check
  (the CI step, or the manual check above) and its result on the launch commit.

**Tests**:
- `website.yml` deploys from the named branch and not from others (a dry run on a branch that is not
  named shows the deploy job skipped).
- After deploy, a smoke job fetches the live home, `robots.txt` and `sitemap.xml` over HTTPS and
  checks the canonical is the address.

**Acceptance criteria / DoD**:
- The site is live at the address, the old page is gone, and every DEC-141 row is ticked in
  `launch-checklist.md` with its evidence.
- Search Console and Bing show the site verified and the sitemap read.

**Risks**: Medium. The switch of the Pages source is the one moment the site can be down; it is a
setting change and is reversed by switching back to the `gh-pages` branch.

**Complexity**: **M**

---

## Phase-level acceptance

Phase 17 is complete when:

1. The site is live at the address, built by Astro from `apps/website/`, deployed by a workflow, and
   `gh-pages-root/` and its publishing are gone. *SITE-01, SITE-13.*
2. Every page DEC-139 lists is there: home, features, download, guide, FAQ, changelog, privacy,
   terms, the blog and a 404. *SITE-06…SITE-11.*
3. The site's colors, type, corners, outlines and shadows come from the app's tokens, and a test
   fails if they drift. *SITE-02.*
4. Every 3D scene loads after the page is usable, follows the scroll, draws in the app's pixel
   style, and shows its own rendered still with no WebGL, with reduced motion, on save-data and on a
   slow device. *SITE-05, SITE-06, SITE-08.*
5. Every DEC-141 item a machine can check fails the build when broken, and every row is ticked with
   its evidence in `launch-checklist.md`. *SITE-03, SITE-13.*
6. LCP ≤ 2.5 s, TBT ≤ 200 ms and CLS ≤ 0.1 on Lighthouse's mobile emulation for the home, download, a
   guide page and a post, with the 3D. *SITE-03.*
7. Before 1.0.0 the site offers no download and links GitHub's releases; from 1.0.0 it offers the
   visitor's system and chip in one click, and every file of the release. *SITE-07.*
8. Both forms deliver; the analytics set no cookie and count downloads. *SITE-12.*
9. The guide is built from `docs/user-guide/` and the changelog from `CHANGELOG.md`, with no copy of
   either in the site. *SITE-09, SITE-10.*
10. The user approved the home page, the privacy and terms text and the first post.
11. No decision in DEC-001…DEC-198 is contradicted. A
    contradiction stops the work and is raised rather than worked around.

## Decision Round 20 — what writing the steps raised

Asked in `OPEN_QUESTIONS.md` as Q-180…Q-189 and answered on 2026-10-07: the recommendation on
seven, B on Q-185 and Q-187, and the mark made the app's icon.

| Question | Recommendation | Answer | Needed by |
| --- | --- | --- | --- |
| Q-180 — The opening scene | A: the crate becomes the wheel | DEC-189: A | SITE-06 |
| Q-181 — The site's colors | A: the app's five themes, switchable, Neo Dark first | DEC-190: A | SITE-02, SITE-05 |
| Q-182 — Sound | B: an opt-in speaker button, the voxels moving to a loop you own | DEC-191: B | SITE-06 |
| Q-183 — The analytics service | A: Umami Cloud | DEC-192: A | SITE-11, SITE-12 |
| Q-184 — The form service | A: Web3Forms | DEC-193: A | SITE-11, SITE-12 |
| Q-185 — The download before 1.0.0 | A: the newest test release, marked Preview | DEC-194: **B**, no download until 1.0.0 | SITE-07 |
| Q-186 — When the site goes live | A: at the end of this phase, from `feature` until v1 is on `main` | DEC-195: A | SITE-13 |
| Q-187 — The domain | B: buy one before launch | DEC-196: B | SITE-13 |
| Q-188 — Comparison pages | A: yes, factual and dated | DEC-197: A | SITE-08 |
| Q-189 — The mark and the favicon | A: a new pixel-art mark | DEC-198: A, and it is the app's icon (DIST-09) | SITE-11 |

## Deferred, with reasons

- **Other languages.** DEC-139: English only.
- **A newsletter.** DEC-143: none.
- **Docs versioned by release.** The guide shows the app as `feature` has it. Versions of it are not
  asked for.
- **Server-side features** (accounts, comments, a forum). GitHub Pages is static; not asked for.
- **A/B tests.** Not asked for, and the analytics count, not experiment.
- **Removing the old GA4 property and the old `gh-pages` files.** The user's to do, when wanted
  (facts 3 and 4).
