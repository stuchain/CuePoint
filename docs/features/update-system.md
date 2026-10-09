# Update system

How the desktop app finds, downloads and installs a new version (Phase 16, DIST-05 to DIST-07). The CLI does not update itself. For what users see, read the [Updates](../user-guide/updates.md) page of the user guide. For how a release is published, read the [release runbook](../release/release-deployment-runbook.md#updates).

The Sparkle appcast updater and the two appcast feeds of the Qt app are gone.

## Who does what

| Piece | File | Job |
| --- | --- | --- |
| Release list | `electron/releaseList.ts` | Reads the published releases from GitHub's API |
| The rule | `electron/updateRule.ts` | `pickUpdate`: the one pure function that chooses the release (DEC-145) |
| State machine | `electron/updater.ts` | Runs checks, drives either installer, holds the state the page shows |
| Mac installer | `electron/macInstaller.ts` | Downloads, checks and unpacks the Mac zip, and swaps the app after quit |
| Single instance | `electron/singleInstance.ts` | Keeps a second copy from starting |
| Window lock | `electron/navigationGuard.ts` | Keeps the main window on the app's own page |
| Release notes | `electron/updateNotes.ts`, `electron/externalLinks.ts` | Saves and reads a version's notes; the allow-list for links in them |
| Settings | `electron/mainSettings.ts` | `lastCheckedAt`, `lastSeenVersion`, `pendingInstall` |

Business rules stay in main. The page only shows the state and sends `updates:*` requests through the `window.cuepoint.updates` bridge.

## The rule

An installed build is offered the highest published version above its own, compared by SemVer precedence. A test build (`X.Y.Z-test.N`) may be offered a test or a normal release. A normal build is offered normal releases only. A lower or equal version is never offered. Drafts are not in GitHub's list, so a withdrawn release is not offered. The rule picks a release; neither installer chooses one.

## When it runs

Only in a packaged build, and never in an end-to-end run; that includes every network call the updater makes. The first check starts 10 seconds after the first window shows, so for those 10 seconds Settings says **Not checked yet** in an installed app (**Check for updates** works then). Then it repeats every 4 hours while the app is open, and it runs when the page asks (`updates:check`). A check made while another is running joins it. A version already downloaded is not downloaded again. A higher version found while one is ready is downloaded in its place.

The platform decides the target: Windows x64, Mac Apple Silicon or Mac Intel, Linux x64. Any other processor has no target and never checks. A Mac running the Intel build under Rosetta (`app.runningUnderARM64Translation`) gets the arm64 target, so the update replaces it with a native build. Every completed check writes `lastCheckedAt`.

## State

`updates:getState` and the push channel `updates:state` give:

- `status`: `idle`, `checking`, `up-to-date`, `downloading`, `ready`, `manual` or `failed`;
- `currentVersion`, `version` (the one offered), `notes`, `progress` (0 to 100), `releaseUrl`, `lastCheckedAt`;
- `manualReason`: `linux` or `cannot-replace`;
- `error`: `could-not-check`, `download-failed` or `install-failed`.

The design's "available" step is folded into `downloading` (Windows and Mac) and `manual` (Linux, and a Mac that cannot be replaced).

## Windows

CuePoint chooses the release, then hands `electron-updater` that release only (DEC-169). It sets a generic provider to the release's download folder, `https://github.com/stuchain/CuePoint/releases/download/<tag>/`, with `autoDownload` and `autoInstallOnAppQuit` both off and downgrades off. `electron-updater` reads `latest.yml`, and CuePoint refuses the download unless the manifest's version is the chosen version and `electron-updater` announced that same version as an update, so a version is refused before anything is downloaded (DEC-224). `downloadUpdate()` then downloads (only what changed, using the block map when it can) and checks the SHA-512 itself. It does not install: the install starts only from the end of the quit cleanup (see [Restart and install at quit](#restart-and-install-at-quit)). Only HTTPS is accepted (HTTP on this computer for the test feed only).

## macOS

Squirrel.Mac, which `electron-updater` uses on a Mac, refuses an unsigned app, and no build is signed (DEC-170). So `macInstaller.ts` does the work:

1. **Manifest.** Reads the chosen release's `latest-mac.yml` and takes the entry for this chip's zip.
2. **Download.** Streams the zip over HTTPS into `userData/updates/<version>/`, with main's own network stack (`net.fetch`), not the browser's download manager. The manifest has 30 seconds to arrive, and the zip counts as stalled, a network failure that is not reported, after 30 seconds without data. It is deleted and the update fails unless its SHA-512 and size match the manifest.
3. **Unpack.** `ditto -x -k` into the same folder; `ditto` is the only external program. The result must be exactly one `CuePoint.app`, a real folder, whose `CFBundleShortVersionString` is the chosen version and whose executable names this Mac's chip. Both are read in Node (DEC-225): the version from the XML `Info.plist` (a binary plist is refused), the chip from the Mach-O header (thin or fat). There is no `lipo` or `plutil`. Otherwise the folder is deleted and the update fails.
4. **Where.** The running bundle, found from the app's executable path. If CuePoint runs from `/Volumes/` (the disk image), is translocated, or the bundle or its folder cannot be written, nothing is replaced and the state is `manual` with reason `cannot-replace`.
5. **Swap after quit.** A small `sh` script, `userData/updates/install.sh`, is started detached as the last step of the quit cleanup, after the engine and player have stopped. It waits for the app's process to exit (and gives up untouched after 60 seconds), moves the old bundle aside, moves the new one in, and removes the old one. If the move in fails, it moves the old bundle back, so the app is never left missing. When **Restart now** asked for a relaunch, it opens the app at the end: the new one after an install, and the old one on every failure path (it gave up waiting, the new app was missing, a move failed). After **Later** it never opens anything. Its log is `userData/updates/install.log`.

Nothing it writes gets the quarantine flag, and a test checks this. That is why Gatekeeper does not stop the new copy.

## Linux

The check runs with the same rule. If a newer version exists, the state is `manual` with reason `linux`, the version, the notes and the release page. Nothing downloads. The AppImage is replaced by hand (DEC-174).

## Restart and install at quit

Both platforms install the same way, and only from the end of the quit cleanup (DEC-224). `autoDownload` and `autoInstallOnAppQuit` are off, so `electron-updater` never installs by itself.

**Restart now** (`updates:restart`) works only when the state is `ready`. It marks the relaunch and calls `app.quit()`. The quit is held by `quitAfter` while the player and then the engine stop, for at most 5 seconds. The last step of that cleanup is `installAtQuit`: on Windows it calls `quitAndInstall(true, relaunch)` (silent, running the app afterwards only after **Restart now**), on a Mac it starts the detached install script. Quitting without **Restart now** (**Later**, closing the window) takes the same path with no relaunch.

If the 5 second limit is hit, the quit goes ahead without the cleanup, `will-quit` closes installs (`closeInstalls`), and nothing installs on that quit. A ready update stays ready and installs at the next quit. This holds on both platforms. `quitAndInstall` is not called from `restart` itself, because `electron-updater` starts the installer before it asks the app to quit, and the engine and mpv would still hold their files.

Asking first while work runs (DEC-173) is the page's job. **Restart when done** (DEC-228) waits only for the jobs that were running when it was chosen, polling every 2 seconds, and then asks main to restart. Jobs that start afterwards are not waited for. If the page cannot tell what is running, it offers only **Restart now** and **Cancel**.

## A failed install

Before the hand-off, `installAtQuit` writes `pendingInstall` (the version) to main's settings. At the next launch `reportPendingInstall` clears it. If the running version is still lower than that version, the state is `failed` with `install-failed` and one report is made, with the tail of `install.log` (last 20 lines, scrubbed of the user name and home folder) on a Mac (DEC-226). If the hand-off itself throws, the note is cleared and the error is reported at once.

## Single instance

`app.requestSingleInstanceLock()` is the first thing main does. A second launch calls `app.exit(0)` at once, not `quit()`, so it runs none of the quit handlers or cleanup of a copy that started nothing, and it sets up no window or engine. The first copy restores its window if minimized, shows it and focuses it. Without this, a second copy could hold files the installer is replacing and run a second engine on the same library.

## The window is locked to the app's page

The main window carries the preload bridge, so a page from anywhere else loaded into it would hold the bridge. Release notes are untrusted text from the network, so main denies every new window (`setWindowOpenHandler`) and cancels any navigation or redirect that is not the app's own page (`navigationGuard.ts`: the dev server's origin in development, the packaged `index.html` otherwise; the hash and query may change). The system browser is reached only through the narrow `openExternal` helpers (DEC-227).

## What's new

`lastSeenVersion` records the version the user last saw. On a first install, and on the first start of a build that has the updater, it is set to the current version and nothing is shown. When it differs from the running version, the page can ask for that version's notes (`updates:getWhatsNew`) and set it with `updates:dismissWhatsNew`. When an update reaches `ready` (or `manual`), its notes are saved to `userData/updates/<version>/notes.md`. If that file is missing, the notes come from the release list. `updates:getNotes` gives the running version's notes for Settings. What's new is not offered after a downgrade: when the running version is lower than `lastSeenVersion`, it is cleared to the running version and nothing is shown. Files an installed update left behind are removed at launch, except `notes.md`.

## Testing a build

`CUEPOINT_UPDATE_FEED` is honored only when the installed version is a test version. It is a base URL, HTTPS or HTTP on `127.0.0.1` or `localhost`, serving `releases.json` in GitHub's API shape and the files at `<base>/<tag>/<file>`. It replaces GitHub's list and download address. A folder can be served with `python -m http.server`. There is no `file://` support.

## Errors and Sentry

- **Reported once each:** a failed download, a failed checksum, size, version or chip check, and a failed install.
- **Not reported** (DEC-153): offline, a DNS failure, GitHub's rate limit (403, 408 or 429), a timeout, and on a Mac a download that stalls for 30 seconds. A failed check is `failed` with `could-not-check`; a failed download of this kind is `download-failed`. Either way the next scheduled check tries again.
- A failed install found at launch is always reported, as the one exception to the network rule.

## Bridge

`window.cuepoint.updates` has `getState`, `check`, `restart`, `subscribe`, `getWhatsNew`, `dismissWhatsNew`, `getNotes`, `openReleasePage` and `openLink`. `openReleasePage` opens only a CuePoint release page from the current state, never a URL the page sends. `openLink` opens a link in release notes only when it is `https`, has no port or credentials, and its host is `github.com`, a subdomain of `github.com`, `usecuepoint.com` or `www.usecuepoint.com`; anything else is refused quietly. Types are in `renderer/src/api/cuepointBridge.types.ts`, and `desktopContract.test.ts` holds every `updates:*` channel.
