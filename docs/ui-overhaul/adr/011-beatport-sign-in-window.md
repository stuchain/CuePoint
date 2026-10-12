# ADR-011: Beatport sign-in runs in a second window with its own partition

## Status

Accepted (C12, 2026-10-12). Records DEC-242. It makes one exception to DIST-07's rule that the app
has a single window that shows only its own pages.

## Context

Discover needs a Beatport user token. Asking a DJ to request an API key and run an OAuth exchange
does not work (DEC-098 left that alone). Beatport's own site holds a user token for a signed-in
person, and the only way to let someone sign in there is to show them Beatport's page.

The main window cannot be that place:
- It denies every window open and keeps navigation to the app's own pages (`navigationGuard.ts`).
  That rule is what lets the renderer load nothing from the network.
- Its session is shared with everything the renderer loads. Beatport's cookies would sit beside the
  app's own storage.
- Third-party pages with scripts must never meet the preload bridge.

## Decision

**A second `BrowserWindow`, opened by main for the sign-in only, in the persistent partition
`persist:beatport-signin`.**

- **No bridge.** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag:
  false`, no preload, and devtools only in an unpackaged build. Page scripts never run beside
  `window.cuepoint`.
- **Its own cookie jar.** The partition is not the default session, so Beatport's cookies and
  storage never mix with the app's. Sign out clears the partition. A hidden window in the same
  partition renews the token.
- **A closed set of pages.** Navigation, redirects and popups are allowed only to `https` on
  `*.beatport.com` and the hosts of Beatport's social sign-ins, and `about:blank` for a popup that
  is then navigated (the navigation is checked like any other). Popups open in the same partition
  under the same rules. Downloads and every permission request are refused.
- **Read, not drive.** Main reads the `Authorization` header of requests to `api.beatport.com/v4`
  on that partition's `webRequest`, and the website's session JSON through that partition's
  `fetch`. It never runs script in the page and never fills a form.
- **The main window is unchanged.** It still denies window opens and keeps its navigation rule.
  The sign-in window is opened only by main, on the renderer's `beatport:signIn` request, and is
  modal to the main window.
- **The token stays in main.** The renderer gets a state and a masked preview; see DEC-242.

The rules the window applies are pure functions in `electron/beatportAuthRules.ts` with tests; the
logic is in `electron/beatportAuth.ts`, tested with fakes; the Electron part is a thin host.

## Consequences

Positive:
- Signing in is one button, and the token is encrypted at rest and held in memory by the engine.
- The renderer's isolation is as before: no third-party page ever shares its session or bridge.

Negative:
- A second window and a persistent partition exist. A Beatport cookie jar sits in the user data
  folder, as long-lived as a browser's; Chromium protects it with the OS key on macOS and Windows,
  and with the keyring on Linux where there is one.
- The capture depends on how Beatport's site behaves. If it stops sending the header and the
  session JSON, sign-in stops working and the paste fallback is what is left.
- Popups for social sign-in widen the allow-list to hosts we do not control.

## When superseded

Revisit when any of these holds:
- Beatport offers a public OAuth flow for desktop apps, with a redirect CuePoint can handle: the
  window would give way to the system browser.
- Beatport's site no longer exposes a user token to the page in either form for two releases.
- A second purpose for a third-party window appears, which would need a general policy rather than
  this exception.
