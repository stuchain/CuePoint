# Accessibility

This page says what CuePoint does so that people can use it with a keyboard, a screen reader, large text, high contrast or less motion, how each is checked, and how to tell us about something that does not work.

## What is supported

CuePoint aims at [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA.

- **Checked automatically on every release.** An automated checker (axe) scans every page of the packaged app, Library, Clean, Keys, Discover, Prepare, Statistics and Settings, with a library loaded, in each of the five built-in themes, at two text sizes (Extra small and Medium), with motion on and with the system asking for less. The page's components are also checked in the tests that run on every change: every dialog, the player bar, the status strip, the sidebar and Track details. A violation fails the build.
- **Colour contrast is held for every theme.** Every text colour reaches 4.5:1 against the surface it sits on, and every control's edge and the focus ring reach 3:1, in all five built-in themes. A test pins each pair.
- **The keyboard reaches everything.** Every page can be used without a mouse: each page's tab order is pinned by a test (reachable, in reading order, no trap, and focus goes back to where it was after a dialog closes), tables answer the arrow keys, and **F6** moves between the parts of the window. The shortcuts are listed below.
- **Windows high contrast.** When Windows' contrast themes are on, CuePoint takes its colours from the system. Borders, the keyboard focus ring, the selected row, the active tab, the player's controls and the waveform stay visible; a fill or a shadow is never the only thing that tells you something.
- **Reduced motion.** When your system is set to reduce animations, CuePoint keeps still. **Settings > Motion** also has **Follow system**, **On**, **Off** and **Custom**, which switches each kind of motion on its own.
- **Text size.** **Extra small (1×)**, **Small (1.25×)**, **Medium (1.5×, the default)**, **Large (2×)** and **Extra large (3×)**, in **Settings > Appearance** or **View > Size**, and **Ctrl+=**, **Ctrl+-** and **Ctrl+0** (**Cmd** on a Mac). The size changes text and controls together, and controls keep a pointer target of at least 24 pixels.
- **Themes.** Five built-in themes (Neo dark, Retro 16-bit, Classic, Club neon and Muted). A theme you make yourself is derived the same way, but its colours are yours, so check them.

## Screen readers

CuePoint is checked by hand with **NVDA** on Windows and **VoiceOver** on macOS before a release: the first-run guide, an import, finding and playing a track, adding a track to a Collection, Clean's review and an export, each with motion reduced. That pass is part of the release checklist, and until it is recorded for a release, treat screen reader support as checked by the automated rules only. Narrator on Windows and Orca on Linux are not part of the pass.

Some things to know:

- The player's timeline is a slider named **Seek**. It reads the position and the length, for example "1:12 of 6:40", and the arrow keys move it.
- The full-window recovery screens put focus on their heading when they open, so a screen reader reads where you are.
- The window's menu bar hides itself; **Alt** shows it. (On a Mac the menu bar is the system's.)

## Keyboard shortcuts

**F1** or **Ctrl+?** opens the full list (also **Help > Keyboard shortcuts**), which you can search. The list below is the same list. On a Mac, **Cmd** takes the place of **Ctrl**. Nothing can be rebound.

**Everywhere**

| Shortcut | Does |
| --- | --- |
| **Ctrl+O** | Import a Rekordbox file |
| **Ctrl+,** | Settings |
| **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | Larger text, smaller text, default text size |
| **Ctrl+K** | Search library |
| **Ctrl+I** | Show or hide Track details |
| **Ctrl+B** | Show or hide the sidebar |
| **Ctrl+Shift+A** | Activity |
| **F6** / **Shift+F6** | Go to the next or previous pane |
| **Ctrl+?** or **F1** | Keyboard shortcuts |
| **Esc** | Close a dialog, panel or search |
| **Alt+T** | Go to the newest message |

**Library**

| Shortcut | Does |
| --- | --- |
| **Ctrl+F** | Search these tracks |
| **Ctrl+A** | Select all matching tracks |
| **Enter** | Play the selected track |
| **Esc** | Clear the selection |
| **Shift+F10** | Open the track menu |
| **Alt+Up** / **Alt+Down** | Move the selected track up or down in a Collection |
| **F2** / **Delete** | Rename or delete the selected Collection |

**Keys**

| Shortcut | Does |
| --- | --- |
| **Ctrl+Click** | Add or remove a key from the choice |
| **Shift+Click** | Choose every key between the last one and this one |

**Prepare**

| Shortcut | Does |
| --- | --- |
| **Left** / **Right** | Resize the source panel (focus its divider first) |
| **Ctrl+F** | Search the Library tab |
| **Enter** | Play from here |
| **F2** | Edit mix-in time |
| **Enter** (while typing) | Save a typed time |
| **Tab** | Save a typed time and go to the next |
| **Esc** | Drop a typed time |
| **Alt+Up** / **Alt+Down** | Move the selected tracks |
| **Delete** | Remove the selected tracks |

**Tables** (every track table)

| Shortcut | Does |
| --- | --- |
| **Up** / **Down** | Select the previous or next track |
| **Shift+Up** / **Shift+Down** | Extend the selection |
| **Home** / **End** | First or last track |
| **Page Up** / **Page Down** | A page up or down |
| **Ctrl+Space** | Add or remove the focused track |

**Clean's review**

| Shortcut | Does |
| --- | --- |
| **Up** / **Down** | Previous or next track in the review |
| **Home** / **End** | First or last track |
| **Ctrl+A** | Select every track |
| **Esc** | Close the track's side panel |
| **Enter** | Play the track |
| **Ctrl+Space** | Tick or untick the track |
| **N** | Next track still to check |

**Check the match** (the side panel)

| Shortcut | Does |
| --- | --- |
| **Left** / **Right** | Select the previous or next candidate |
| **1**–**9** | Select a candidate by its number |
| **Enter** | Use the picked match and go to the next track |
| **Shift+Enter** | Use the picked match and stay on the track |
| **Backspace** | Leave the track out |

**Player**

| Shortcut | Does |
| --- | --- |
| **Space** | Play or pause |
| **Ctrl+Right** / **Ctrl+Left** | Next or previous track |
| **Ctrl+Up** / **Ctrl+Down** | Volume up or down |
| **Up** / **Down**, **Home** / **End** | In the queue: select a track, first or last |
| **Enter** | Play the queued track |
| **Menu key** or **Shift+F10** | Open the menu for a queued track |
| **Alt+Up** / **Alt+Down** | Move a queued track |
| **Delete** | Remove a queued track |
| Media keys | Play/Pause, Next and Previous, while CuePoint is focused |

[The CuePoint window](the-window.md#keyboard-shortcuts) explains where each is used.

## Report a barrier

If something in CuePoint cannot be used the way you need to, that is a defect, and we want to know.

1. Choose **Help > Get help**. Write what you were doing and what stopped you, and press **Send note**. It is sent exactly as you write it, with the app's version.
2. If sending is off in **Settings > Privacy**, or you would rather not send it, choose **Save a help file...** in the same dialog and attach the file to an issue.
3. Or open an issue on GitHub: [report an accessibility barrier](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml). Say which assistive technology and which system you use (for example NVDA on Windows 11, or VoiceOver on macOS 15), the page, and what happened.

The [known issues](../release/known-issues.md) list what is already known, and the [Support Policy](support-policy.md) says how quickly to expect an answer.
