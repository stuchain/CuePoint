# Release Communication Templates

Templates for communicating releases to users and stakeholders.

---

## GitHub Release Notes Template

```markdown
## CuePoint v{VERSION}

### What's New
- {Feature 1}
- {Feature 2}
- {Improvement 1}

### Bug Fixes
- Fixed {Issue 1}
- Fixed {Issue 2}

### Changes
- {Change 1}
- {Change 2}

### Installation

#### Windows
1. Download `CuePoint-Setup-v{VERSION}.exe`
2. Run the installer
3. Follow the installation prompts

#### macOS
1. Download `CuePoint-v{VERSION}-macos-universal.dmg`
2. Open the DMG file
3. Drag CuePoint.app to Applications folder

### Upgrade Notes
{Any special upgrade instructions}

### Full Changelog
See [CHANGELOG.md](https://github.com/StuChain/CuePoint/blob/main/CHANGELOG.md) for complete list of changes.

---

**Download**: [Windows]({WINDOWS_URL}) | [macOS]({MACOS_URL})
```

---

## Release Announcement Template

```markdown
# CuePoint v{VERSION} Released

We're excited to announce the release of CuePoint v{VERSION}!

## Highlights

{Key features or improvements}

## What's Changed

{Summary of changes}

## Download

- **Windows**: [Download Installer]({WINDOWS_URL})
- **macOS**: [Download DMG]({MACOS_URL})

## Upgrade

If you have CuePoint installed, the app will automatically check for updates on startup. You can also manually check via **Help > Check for Updates**.

{Upgrade instructions if needed}

## Feedback

We'd love to hear your feedback! Please report any issues or suggestions on our [GitHub Issues](https://github.com/StuChain/CuePoint/issues) page.

---

**Full Release Notes**: [GitHub Release]({RELEASE_URL})
```

---

## Social Media Template (if applicable)

```
🎉 CuePoint v{VERSION} is now available!

{Key feature highlight}

Download: {DOWNLOAD_LINK}

#CuePoint #DJTools #MusicProduction
```

---

## Email Template (if applicable)

```
Subject: CuePoint v{VERSION} Released

Hi {User},

We're excited to announce the release of CuePoint v{VERSION}!

{Key highlights}

Download: {DOWNLOAD_LINK}

{Upgrade instructions}

Thank you for using CuePoint!

Best regards,
The CuePoint Team
```

---

## Update Notification Message (In-App)

```
Update Available

Version {NEW_VERSION} is now available.

What's New:
{Key features/changes}

Download Size: {SIZE} MB

[Download & Install] [Remind Me Later] [Skip This Version]
```

---

## Usage

1. **Copy appropriate template**
2. **Replace placeholders**:
   - `{VERSION}` - Version number (e.g., "1.0.1")
   - `{WINDOWS_URL}` - Windows installer download URL
   - `{MACOS_URL}` - macOS DMG download URL
   - `{RELEASE_URL}` - GitHub release page URL
   - `{Feature X}` - Actual features
   - `{Issue X}` - Actual bug fixes

3. **Customize content** for your specific release

4. **Review and publish**

---

## Best Practices

1. **Be Clear**: Use simple, clear language
2. **Be Honest**: Don't oversell features
3. **Be Helpful**: Include installation instructions
4. **Be Responsive**: Monitor feedback and respond quickly
5. **Be Grateful**: Thank users for their support
