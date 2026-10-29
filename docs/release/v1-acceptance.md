# CuePoint 1.0 acceptance checklist

This is the list of everything that has to be checked on a real build before `v1.0.0` is tagged.
It exists because earlier phases left checks for later: things a test in the repository cannot do,
such as listening to two tracks join, unplugging a sound card, opening a file in Rekordbox, or
running a screen reader. Each was accepted as part of its phase (DEC-188), and 1.0 is where they are
kept. It is HARDEN-09 in [the Phase 18 plan](../v1/PHASE18_HARDENING.md).

## The rule for release day

`v1.0.0` is tagged only when **no row below says `owed` or `fail`**. A row is done when its result is
`pass`, or `not applicable (reason)`. The release workflow runs `python scripts/check_acceptance.py
--release` for a normal tag and stops if any row is not done. A test tag (`v1.0.0-test.N`) is never
held back by this list.

Anything found while running the checks that is not a blocker goes on `docs/release/known-issues.md`
instead (DEC-188). A failure that is a blocker becomes a fix in HARDEN-10, and the row is run again.

## Owner's pick for Intel Macs (DEC-308)

The by-hand checks are run on an Apple Silicon Mac. The Intel Mac is covered by CI: the packaged suite
runs on the `macos-15-intel` runner on every push and in full on a release. So a by-hand row that named
macOS Intel marks Intel as `covered by CI (packaged suite on the Intel runner)`, not `owed`. A row that
needs hardware (exclusive output, unplugging an interface, listening for a gap, a USB drive, Rekordbox,
a screen reader) names Apple Silicon and Windows only. Rows whose How is `CI` are unchanged: they still
need the Intel runner green.

## How to read the table

- **Check:** what to do or what has to be true, in plain words.
- **From:** where the check was first written down, as `file:line` in this repository, so you can read
  what was asked and what was already seen.
- **Systems:** where it has to pass. The three that block the tag are Windows, macOS Apple Silicon and
  macOS Intel (DEC-188). Linux is experimental at 1.0, so it appears only on checks that CI does by
  itself, and nobody checks Linux by hand (DEC-187). A check that is not tied to one system, such as the
  live Beatport pass, is listed once, under Windows.
- **How:**
  - `CI` means the automated builds do it. They are `desktop-electron.yml` (the packaged app,
    run on all four systems) and `scale.yml` (the 50,000-track run). The row turns `pass` when a
    run with `release: true` is green on the system, and the date is that run's date.
  - `Remote Control` means a Claude Code session drives the machine and records what it saw.
  - `by hand` means a person does it, on their own machine. This covers anything that needs hardware,
    a second app, or ears.
- **Result:** `owed` until it has been run. Then `pass`, `fail`, `not applicable (reason)` or, for macOS
  Intel only, `covered by CI (reason)`. Each system has its own result. A row whose systems share one
  result writes it once. Otherwise the cell lists every system, as `Windows: pass; macOS Intel: owed`. The
  row is done only when every system in it is done.
- **Date:** the day each result was recorded, as `YYYY-MM-DD`, written the same way as the result
  (`Windows: 2026-10-12; macOS Intel: -`). Owed shows `-`.

To record a result, edit the row's last two cells and commit. `src/tests/unit/scripts/test_acceptance_doc.py`
keeps the table well formed: every row has a check, a source that exists, systems, a how, a result and a
date once the result is not `owed`.

## Known deviation: the whole packaged suite on `scale.yml`

The HARDEN-09 spec also has the whole packaged suite run in `scale.yml`. It is not there. That workflow's
Intel leg already takes about 2.6 hours, and the whole suite packaged adds 25 to 35 minutes on Intel. The
whole suite runs packaged in `desktop-electron.yml` on a release (`release: true`) on all four systems, and
that is what the first row of the table waits for. The deferral is accepted until `scale.yml` has the room.

## Two things that are not here

- **Notarization.** CuePoint's Mac builds are not signed with an Apple Developer ID (DEC-170), so there is
  nothing to submit to Apple. The two rows that asked for it (Phase 5 and Phase 8) are marked not
  applicable, and the first install by hand, which Gatekeeper makes everyone do, stands in their place.
- **After the tag.** Checking that the published downloads work and that an installed older copy offers the
  new one are the runbook's "After release" steps. They happen once the release exists, so they cannot
  hold the tag back, and they are not in this table.

Order below: this phase's own CI checks, then Phase 5 to Phase 16 in order, then the runbook's checks on
the built installers, then the screen-reader pass (HARDEN-08).

| Check | From | Systems | How | Result | Date |
| --- | --- | --- | --- | --- | --- |
| The whole end-to-end test suite passes against the packaged app, on every system, in a run with `release: true` | docs/v1/PHASE18_HARDENING.md:821-822 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Each Mac app passes the bundle check (`verify_macos_bundle.py`: no stray files, everything signed, the signature verifies), unsigned | docs/v1/PHASE18_HARDENING.md:801-802 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| No source map (a debugging file for Sentry) ships inside the packaged app | docs/v1/PHASE13_REPORTING.md:799 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 5, Windows: the player checks, run again on the mpv version now pinned (format decoding, real-mpv tests, the playback tests) | docs/v1/PHASE5_PLAYER.md:1417-1421 | Windows | CI | owed | - |
| Phase 5, Intel Mac: build, formats, play and queue, quitting leaves no mpv behind, the end-to-end suite, and the app with no player (Phase 5 rows 1, 3, 4, 5, 10 and 11 passed on an Apple Silicon Mac only) | docs/v1/PHASE5_PLAYER.md:1333-1337; docs/v1/PHASE5_PLAYER.md:1342-1343 | macOS Intel | CI | owed | - |
| Phase 5, Mac: Apple notarization of the Mac app (`notarytool`). There is no Developer ID, so there is nothing to notarize; the first install by hand replaces it | docs/v1/PHASE5_PLAYER.md:1334; docs/v1/PHASE5_PLAYER.md:1418-1419 | macOS Apple Silicon, macOS Intel | by hand | not applicable (DEC-170) | 2026-10-29 |
| Phase 8, Mac: a `notarytool` submission with a Developer ID. Same reason as the row above | docs/v1/PHASE8_EXPORT.md:1690-1691 | macOS Apple Silicon, macOS Intel | by hand | not applicable (DEC-170) | 2026-10-29 |
| First install by hand on a Mac: open the DMG, drag CuePoint to Applications, see Gatekeeper's prompt for an unsigned app, clear it as the user guide says, open CuePoint and play a track | docs/release/release-deployment-runbook.md:154; docs/v1/PHASE16_DISTRIBUTION.md:105-106 | macOS Apple Silicon, macOS Intel | by hand | macOS Apple Silicon: owed; macOS Intel: covered by CI (packaged suite on the Intel runner) | macOS Apple Silicon: -; macOS Intel: 2026-10-29 |
| Phase 5: exclusive output on a real audio interface. Pick the interface, switch exclusive output on, then make it fail by having another app hold the device; CuePoint falls back and says so (Windows: WASAPI exclusive; Mac: hog mode) | docs/v1/PHASE5_PLAYER.md:1338; docs/v1/PHASE5_PLAYER.md:1448 | Windows, macOS Apple Silicon | by hand | owed | - |
| Phase 5: unplug the selected audio interface during playback. CuePoint switches to the system default, shows a notice, and plays the same track again rather than skipping it | docs/v1/PHASE5_PLAYER.md:1339; docs/v1/PHASE5_PLAYER.md:1449 | Windows, macOS Apple Silicon | by hand | owed | - |
| Phase 5: two tracks in a row play with no gap, by ear (the machine measured no gap; nobody has listened) | docs/v1/PHASE5_PLAYER.md:1341; docs/v1/PHASE5_PLAYER.md:1451 | Windows, macOS Apple Silicon | by hand | owed | - |
| Phase 7: Clean's file check on a real USB drive, including one woken from sleep, and on a real network share | docs/v1/PHASE7_CLEAN.md:1936-1939 | Windows, macOS Apple Silicon | by hand | owed | - |
| Phase 8: open a file CuePoint exported in Rekordbox 6 and in Rekordbox 7 (the user guide says how) and look. The playlists and folders are there with their tracks in order; hot cues, memory cues and beat grids are intact; a changed key and a five-star rating show; a Smart Collection appears as a playlist | docs/v1/PHASE8_EXPORT.md:1496-1515; docs/v1/PHASE8_EXPORT.md:1687-1689 | Windows, macOS Apple Silicon | by hand | owed | - |
| Phase 8: the Library fits the window at scale 2 on a Mac (at scale 2 and a laptop-height window only one row of four was fully visible) | docs/v1/PHASE8_EXPORT.md:1674-1683; docs/v1/PHASE8_EXPORT.md:1694 | macOS Apple Silicon, macOS Intel | Remote Control | owed | - |
| Phase 8: the two `playback` tests that double-click a row to play it pass on a Mac (they failed at `rows.nth(1)`; the cause is fixed in the code, see Known reds below) | docs/v1/PHASE8_EXPORT.md:1646-1653; docs/v1/PHASE10_PREPARE.md:2260-2263; docs/v1/PHASE10_PREPARE.md:2503-2506 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| Phase 9: the packaged checks on a Mac | docs/v1/PHASE9_DISCOVER.md:3013-3014 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| Phase 9: one pass through the app against the live Beatport service, with your own token (once; not tied to a system) | docs/v1/PHASE9_DISCOVER.md:3014-3016 | Windows | by hand | owed | - |
| Phase 10: the packaged runs of Prepare (Sets, chapters, times, suggestions, export, set lists). Windows passed once on 2026-10-08; macOS never ran | docs/v1/PHASE10_PREPARE.md:3142-3153 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 11: the packaged waveform runs (analysis, the four places a waveform shows, loudness). Linux needs a named mpv (`CUEPOINT_MPV_PATH`), which CI sets | docs/v1/PHASE11_WAVEFORMS.md:2216-2223 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 11: the decoder's timings on the pinned Mac build (`bench_decoder.py`), held to their budget | docs/v1/PHASE11_WAVEFORMS.md:2222 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| Phase 11: the waveform release check (`fetch_player_sidecar.py --check-analysis`) on the pinned Mac build | docs/v1/PHASE11_WAVEFORMS.md:2231-2232 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| Phase 11: playback has no dropouts while the waveform analysis runs, and the Library stays responsive (needs a real audio device, so CI cannot run it) | docs/v1/PHASE11_WAVEFORMS.md:2188-2190; docs/v1/PHASE11_WAVEFORMS.md:945-946 | macOS Apple Silicon | by hand | owed | - |
| Phase 12: the nine tests that play audio, which the clean-up phase could not run without a player | docs/v1/PHASE12_CLEANUP.md:858-860; docs/v1/PHASE12_CLEANUP.md:1233-1235 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 12: the Mac run's open spec (`organization.spec.ts`, "changes everything a query matches") and the Test workflow, which was red on macOS | docs/v1/PHASE12_CLEANUP.md:1259-1272; docs/v1/PHASE12_CLEANUP.md:1249-1251 | macOS Apple Silicon, macOS Intel | CI | owed | - |
| Phase 13: one error from each of the three processes (the app's main process, the page, the engine) reaches Sentry and reads as source code, not as minified code | docs/v1/PHASE13_REPORTING.md:800-801 | Windows, macOS Apple Silicon, macOS Intel | by hand | Windows: owed; macOS Apple Silicon: owed; macOS Intel: covered by CI (packaged suite on the Intel runner) | Windows: -; macOS Apple Silicon: -; macOS Intel: 2026-10-29 |
| Phase 13: the eleven acceptance points of error reporting, in a packaged build | docs/v1/PHASE13_REPORTING.md:970-992; docs/v1/PHASE13_REPORTING.md:959-964 | Windows, macOS Apple Silicon, macOS Intel | Remote Control, by hand | Windows: owed; macOS Apple Silicon: owed; macOS Intel: covered by CI (packaged suite on the Intel runner) | Windows: -; macOS Apple Silicon: -; macOS Intel: 2026-10-29 |
| Phase 13: a day of using a packaged build with reporting on, every report read in Sentry for anything personal (once; not tied to a system) | docs/v1/PHASE13_REPORTING.md:959-960 | Windows | by hand | owed | - |
| Phase 13: the privacy notice's sentences on retention (30 days), the EU region, and IP addresses, confirmed against the two Sentry projects (once; not tied to a system) | docs/v1/PHASE13_REPORTING.md:961-963 | Windows | by hand | owed | - |
| Phase 15: the Statistics page looked at in every theme and scale, on your own library (once; your library is on one machine) | docs/v1/PHASE15_STATISTICS.md:750; docs/v1/PHASE15_STATISTICS.md:1019-1020 | Windows | Remote Control | owed | - |
| Phase 16: the first green four-leg run of the desktop build | docs/v1/PHASE16_DISTRIBUTION.md:317 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 16: the update files (`latest*.yml`) from a real release run are checked | docs/v1/PHASE16_DISTRIBUTION.md:376-377 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Phase 16: the mpv mirror workflow (`mirror-player-sidecar.yml`) has had its first run | docs/v1/PHASE16_DISTRIBUTION.md:447-448 | Linux | CI | owed | - |
| Phase 16: the new Mac icon, in an installed build | docs/v1/PHASE16_DISTRIBUTION.md:858-861 | macOS Apple Silicon, macOS Intel | by hand | macOS Apple Silicon: owed; macOS Intel: covered by CI (packaged suite on the Intel runner) | macOS Apple Silicon: -; macOS Intel: 2026-10-29 |
| Phase 16: the Linux package starts and passes the packaged suite. Nobody checks the AppImage by hand (DEC-187) | docs/v1/PHASE16_DISTRIBUTION.md:861; docs/v1/PHASE18_HARDENING.md:821-822 | Linux | CI | owed | - |
| Runbook, install on Windows: run the installer, confirm the shortcut, and note whether SmartScreen asks | docs/release/release-deployment-runbook.md:154; docs/release/release-deployment-runbook.md:161 | Windows | by hand | owed | - |
| Runbook, launch: the main window appears and the engine starts, with no engine error on screen | docs/release/release-deployment-runbook.md:155 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Runbook, the happy path: import a Rekordbox XML file, match about 10 tracks of a playlist in Clean, review a match, save the list as a file, quit and open again, and the library is still there | docs/release/release-deployment-runbook.md:156 | Windows, macOS Apple Silicon, macOS Intel | Remote Control | owed | - |
| Runbook, the player: play a track and its waveform draws (this covers the player that ships inside the app) | docs/release/release-deployment-runbook.md:157 | Windows, macOS Apple Silicon, macOS Intel, Linux | CI | owed | - |
| Runbook, errors: cancel a run partway and nothing is damaged; an invalid XML file gives a clear message; matching with the network off gives a clear message | docs/release/release-deployment-runbook.md:158 | Windows, macOS Apple Silicon, macOS Intel | Remote Control | owed | - |
| Runbook, the Help menu: About CuePoint shows the right version, and Export support bundle writes a bundle | docs/release/release-deployment-runbook.md:159 | Windows, macOS Apple Silicon, macOS Intel | Remote Control | owed | - |
| Runbook, uninstall and reinstall on Windows: it behaves the same afterwards | docs/release/release-deployment-runbook.md:160 | Windows | by hand | owed | - |
| Runbook, update from the previous release: the old copy says the new version is ready within about a minute; Restart now installs it with library and settings unchanged and no old process left; Later and quit installs at quit. Mac: no Gatekeeper prompt, and an app in a folder you cannot write shows Download. Passed on Windows (2026-10-11, 2026-10-12) and Apple Silicon (2026-10-11) with test builds; the Intel Mac is covered by CI, and the read-only folder is still owed | docs/release/release-deployment-runbook.md:161; docs/v1/PHASE16_DISTRIBUTION.md:725-734; docs/v1/PHASE16_DISTRIBUTION.md:771-772 | Windows, macOS Apple Silicon, macOS Intel | by hand | Windows: pass; macOS Apple Silicon: owed; macOS Intel: covered by CI (packaged suite on the Intel runner) | Windows: 2026-10-12; macOS Apple Silicon: -; macOS Intel: 2026-10-29 |
| Screen reader on Windows (NVDA), with motion reduced: the first-run guide, an import, finding and playing a track, adding it to a Collection, Clean's review, an export, and the app's menu bar | docs/v1/PHASE18_HARDENING.md:764-766; docs/v1/PHASE18_HARDENING.md:751-752 | Windows | by hand | owed | - |
| Screen reader on a Mac (VoiceOver), with motion reduced: the same walk-through, and the app's menu bar | docs/v1/PHASE18_HARDENING.md:764-766; docs/v1/PHASE18_HARDENING.md:751-752 | macOS Apple Silicon | by hand | owed | - |

## Known reds

Three failures were carried into HARDEN-09 as known. What was found on each:

- **The `playback` tests on a Mac (`rows.nth(1)`).** Phase 8's Mac pass found that a first click on a row
  that is only partly visible made the browser scroll it, so the second click of a double-click landed on
  something else (`docs/v1/PHASE8_EXPORT.md:1655-1683`). Three changes since then address it, and the tests
  were never weakened. `TrackTable` no longer scrolls a row into view on a mouse click (DEC-112). The
  selection bar is drawn over the table's bottom rows so it cannot move them (commit `6e3005e8`). And
  `e2e/rowClick.ts` scrolls the row into view itself before it clicks and refuses a click whose point is not
  on the row. Both tests pass on Linux in the development build. They have not been seen on a Mac since, so
  the row above stays `owed`; the Mac legs of `desktop-electron.yml` run them on every push, which is the
  evidence that will close it.
- **The Qt guard hook on a Mac.** The `${p,,}` lowercase expansion needs bash 4, and macOS ships bash 3.2.
  It was replaced with `tr` in `.claude/hooks/lib.sh` (commit `306eb647`), and
  `src/tests/unit/scripts/test_claude_hooks_bash_compat.py` reads every hook for bash-4-only syntax. Nothing
  more was needed.
- **`StatusStrip.test.tsx`, "follows progress over SSE rather than by polling".** It failed at 1,062 ms
  against Testing Library's one-second wait when the whole renderer suite ran on a busy machine. The race
  with the job poll was already fixed in `52df5be2`; what was left is the one-second wait itself. The file
  now waits four seconds inside a fifteen-second test budget, so a slow run passes and a really red test says what it waited for. It passed
  in a full run of the renderer suite here and eight times beside a deliberately busy machine, but it was
  never seen failing in this container, so this is a fix to the stated cause rather than a reproduced one.
