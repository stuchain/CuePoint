# Updates

On Windows and Mac, CuePoint finds new versions itself and installs them. You do not download anything after the first install.

## What happens

1. CuePoint checks for a new version about 10 seconds after its window opens, then every 4 hours while it is open. It asks GitHub, where the versions are published. It does this only in the installed app, not when run from source.
2. If there is a newer version for you, CuePoint downloads it in the background on Windows and Mac. You can keep working.
3. When the download is done, the status strip at the bottom shows **CuePoint X is ready**. While it downloads, the strip shows the progress.
4. Click it to read what changed, then choose **Restart now** or **Later**.
   - **Restart now** closes CuePoint, installs the new version and opens it again.
   - **Later** leaves the update for the next time you quit. It installs then, and the item stays in the status strip until it does. The install starts only after CuePoint has finished closing its player and engine. If closing takes longer than 5 seconds, nothing installs on that quit, and the update installs the next time you quit.

If something is still running when you choose **Restart now**, such as matching or waveform analysis, CuePoint says what it is and asks first. You can choose **Restart when done**, **Restart now** or **Cancel**. **Restart when done** waits for the work that was running when you chose it, then restarts. Work that starts later, such as a check that follows an import, is not waited for. While it waits, the status strip says when CuePoint will restart, and you can cancel the restart.

Your library and settings stay as they are. CuePoint also makes its usual backup when it starts.

## Where to check

Open **Settings** and go to **About & updates**. It shows the version you have, when CuePoint last checked, and what it is doing now: up to date, checking, downloading or ready. In the first seconds after CuePoint starts, before the first check, it says **Not checked yet**; **Check for updates** works then too. Choose **Check for updates** to check now. **What's new** shows the notes for your version. A link in the notes opens in your browser only if it is an https link to GitHub or to the CuePoint site; other links do nothing.

## What's new

The first time you start CuePoint after an update, it shows what changed in that version. Choose **Got it** to close it. It shows once, and not after a first install. It is not offered if you install an older version over a newer one.

## When you download it yourself

CuePoint cannot install the update itself in two cases. The status strip then says **CuePoint X is out**, and **Download** opens the page where the new version is published.

- **Linux.** Updates on Linux are installed by hand. Download the new AppImage and run it.
- **A Mac where CuePoint cannot replace itself.** This happens when CuePoint runs from the disk image, is not in a folder you can write to, or has been moved by macOS to a temporary place. Move CuePoint to Applications (or another folder you can write to) and open it from there, or download the new version and install it as in [Getting started](getting-started.md#install).

## If an update does not install

If you restart and CuePoint opens as the same old version, it tells you the next time it starts that the update did not install, and tries again at the next check. On a Mac, CuePoint keeps a short log of the install, `install.log` in its updates folder; when error reports are on, the last lines of it, with your name and home folder removed, go with the report. On a Mac, if you chose **Restart now** and the install fails, CuePoint opens the old version again, so you are not left without the app. A Mac that is on Apple Silicon but runs the Intel build (under Rosetta) is offered the Apple Silicon build, which replaces it.

## If CuePoint can't check

If you are offline, or GitHub cannot be reached, CuePoint says it could not check and tries again at the next check. Nothing is lost, and this is not sent anywhere as an error report. On a Mac, a download that stops getting data for 30 seconds counts the same way: it is dropped and tried again later.

## Which version you are offered

CuePoint only moves up. It never installs an older version.

- A normal version is offered newer normal versions.
- A **test version** has a name like `1.0.0-test.2`. It is a build shared with testers before the real release. You install a test version by hand, from its page on GitHub. A test version is offered newer test versions and the real release when it comes out.
- If you update a test version to a real release, you get real releases from then on. To test again, install a test version by hand.

There is no setting to turn updates off, and you cannot skip a version.

## Privacy

Checking for updates sends only what any download from GitHub sends: your network address and a user agent, which names the software making the request. It sends no id and nothing from your library. See the [Privacy Notice](https://github.com/stuchain/CuePoint/blob/main/PRIVACY_NOTICE.md).
