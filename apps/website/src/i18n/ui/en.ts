/**
 * Every inline string the translated pages and the shared page chrome use, in English: the source the
 * other languages are translated from (DEC-311). The words are the ones the pages always had; only their
 * place changed. A language's file (`de.ts`, ...) is typed `typeof en`, so it must have every key.
 *
 * Placeholders are written `{name}` and filled by `fmt()` (src/i18n/format.ts). Inline emphasis and links are
 * written `**bold**` and `[label](key)` and drawn by `rich()` (src/i18n/rich.ts); a key is a link the page names.
 * Words that stay English in every language (docs/translation.md) are written as they are.
 */
export const en = {
  /** The language switch. */
  language: {
    label: "Language",
    switchLabel: "Choose a language",
    current: "current language",
  },
  skipLink: "Skip to main content",
  menu: "Menu",
  mainNav: "Main",
  footerNav: "Footer",
  breadcrumb: "Breadcrumb",
  nav: {
    home: "Home",
    features: "Features",
    guide: "Guide",
    faq: "FAQ",
    download: "Download",
    blog: "Blog",
    compare: "Compare",
    changelog: "Changelog",
    contact: "Contact",
    reportBug: "Report a bug",
    privacy: "Privacy",
    terms: "Terms",
  },
  footer: {
    product: "Product",
    help: "Help",
    legal: "Legal",
    tagline: "A free desktop app that cleans up your Rekordbox library.",
    legalLine: "© {year} {publisher}. {site} is free software for DJs.",
  },
  /** The line that says the app is in English; shown on translated pages only. */
  appNote: "The app itself is in English. Areas such as Clean, Library and Keys are named here exactly as the app names them.",
  /** The one primary action while there is no release. Must equal PRIMARY_ACTION.label in src/data/site.ts. */
  primaryAction: "Get notified of 1.0",
  downloadLabel: {
    neutral: "Download",
    windows: "Download for Windows",
    macos: "Download for Mac",
    linux: "Download for Linux",
  },
  downloadedTimes: {
    one: "Downloaded {count} time",
    other: "Downloaded {count} times",
  },
  unshipped: {
    compact: "Preview note: not in the app yet (ships with {step}).",
    title: "Preview note: not in the app yet.",
    body: "This describes something that ships with {step}. A public build fails until this note is removed.",
  },
  appShot: {
    placeholderTag: "Screenshot placeholder",
    placeholderSize: "{width} by {height}, the app's own size",
    placeholderCaption: "Screenshot placeholder: the real picture is coming. It will show {alt}",
    /** Whether the caption's {alt} starts with a lower-case letter (English: "the ..."). */
    placeholderLowerFirst: true,
  },
  sound: "Sound",
  home: {
    seeHow: "See how it works",
    howItWorks: "How it works",
    whatTitle: "What CuePoint does",
    aboutName: "about {name}",
    allFeatures: "All of CuePoint's features",
    trustTitle: "What you can count on",
    seeCode: "See the code on GitHub",
    getTitle: "Get CuePoint",
    getTextRelease: "CuePoint is free for Windows, Mac and Linux.",
    getTextNone:
      "CuePoint 1.0 is not out yet. Get notified on GitHub when it is, and it will be free for Windows, Mac and Linux.",
    frameAlt: {
      messy: "A crate of records in blank gray sleeves, and behind it an empty Camelot wheel.",
      matched: "The records hanging in a grid, each tagged with its key, like 8A or 11B.",
      ready: "The Camelot wheel lit up, every record in its key's place, each cell showing its key.",
    },
  },
  features: {
    pageTitle: "What CuePoint does for your library",
    lead: "CuePoint is a free desktop app that takes the collection you export from Rekordbox, matches it to Beatport and helps you keep it clean. Each part has its own page.",
    listTitle: "The features",
    compareTitle: "Compared with other tools",
    compareIntro:
      "Not sure CuePoint is the right tool? These pages set it beside others, with every fact about the other tool linked to its own page and dated.",
    compareRow: "CuePoint and {name}",
    getTitle: "Get CuePoint",
    howTitle: "How CuePoint helps: {name}",
    notTitle: "What it does not do",
    nextTitle: "Keep going",
    guideNote: "The full steps, in the user guide.",
    allFeatures: "All of CuePoint's features",
    allFeaturesNote: "Every part, one line each.",
    propAlt: {
      clean: "A pixel turntable with a record on it.",
      keys: "A pixel Camelot wheel with a column on each key, taller where there are more tracks.",
      waveforms: "A track's waveform drawn as a landscape of pixel columns, with a playhead across it.",
    },
  },
  compare: {
    pageTitle: "CuePoint compared with other DJ tools",
    pageDescription:
      "CuePoint next to Lexicon, Mixed In Key and OpenKeyScan: facts about each tool linked to its own page and dated, and what CuePoint does not do.",
    headTitle: "CuePoint compared with other tools",
    lead: "DJs already use good tools to look after a library. These pages set CuePoint beside three of them, so you can see what each one does and pick the one that fits.",
    listTitle: "The comparisons",
    rowName: "CuePoint and {name}",
    howTitle: "How these pages are written",
    how1: "Every fact about another tool links the page of that tool it was read on, and says the date we read it.",
    how2: "Every page says what CuePoint does not do.",
    how3: "Tools change. These pages were last checked on {date}. If something is out of date, [tell us](contact) and we will fix it.",
    sideTitle: "Side by side",
    caption: "CuePoint and {name}, topic by topic",
    topic: "Topic",
    source: "Source: {link}, read on {date}.",
    chooseTitle: "Which one fits",
    chooseOther: "Choose {name} if",
    chooseCuePoint: "Choose CuePoint if",
    notTitle: "What CuePoint does not do",
    note: "What we say about {name} comes from {name}'s own public pages on the dates shown, and tools change. See [what CuePoint's Clean page does](clean) or [the other comparisons](compare).",
  },
  faq: {
    title: "FAQ | CuePoint",
    description:
      "Quick answers about CuePoint: whether it is free, what it does to your Rekordbox library, what it sends, how it updates and how to report a problem.",
    heading: "Frequently asked questions",
    lead: "Short answers first, with a link to the part of the [user guide](guide) that goes further.",
    jumpTitle: "The questions",
    moreAbout: "More about: {question}",
  },
  download: {
    title: "Download CuePoint",
    titleWithVersion: "Download CuePoint {version}",
    descriptionRelease:
      "Download CuePoint {version}, free for Windows, macOS and Linux. Every file with its size and checksum, and what to expect the first time you open it.",
    descriptionNone:
      "CuePoint 1.0 is not out yet. See what it will run on, and get notified when the free download for Windows, Mac and Linux is ready.",
    lead: "Free, for Windows, macOS and Linux.",
    version: "Version {version}",
    releaseNotes: "Release notes",
    releaseNotesFor: "for {version}",
    notes: {
      windows: "The installer for 64-bit Windows. Windows may warn you the first time: [here is what to do](windows).",
      windowsArm:
        "Your PC has an Arm chip. CuePoint has no Arm version, so this is the 64-bit (x64) installer, which Windows 11 on Arm runs through its built-in emulation, so it may run slower. [What to expect](windows).",
      macArm: "For Macs with Apple silicon (M1 and later). [Intel Mac?](all) [What to expect](macos).",
      macArmGuess:
        "Your browser does not say which chip your Mac has, so this is the Apple silicon version (M1 and later). [Intel Mac?](all) [What to expect](macos).",
      macIntel: "For Macs with an Intel chip. [Apple silicon Mac?](all) [What to expect](macos).",
      linux: "The AppImage for 64-bit Linux. [Make it runnable first](linux).",
      linuxArm: "CuePoint's Linux build is for 64-bit Intel and AMD computers. There is no version for Arm.",
      unknown: "We could not tell which system you use. Pick yours from [the list below](all).",
      mobile: "CuePoint runs on Windows, macOS and Linux. Open this page on your computer to download it.",
    },
    allTitle: "Every download",
    allAsideBefore: "Every file of version {version}",
    allAsideWide: ", if you want another system's or the button picked the wrong one.",
    allAsidePhone: ". Pick your system.",
    kinds: {
      "windows-x64": { title: "Windows", detail: "Installer for 64-bit Windows 10 or newer" },
      "macos-arm64": { title: "Mac, Apple silicon", detail: "Disk image for M1 and later" },
      "macos-x64": { title: "Mac, Intel", detail: "Disk image for Macs with an Intel chip" },
      "linux-x64": { title: "Linux", detail: "AppImage for 64-bit Intel and AMD computers" },
    },
    checksum: "SHA-256 checksum",
    downloadButton: "Download",
    downloadFor: "CuePoint for {title}",
    verifyTitle: "How to check a download",
    verifyIntro: "Run one of these on the file you downloaded and compare the result with its SHA-256 checksum above.",
    codeWindows: "Windows command",
    codeMac: "Mac command",
    codeLinux: "Linux command",
    codeMacComment: "# or -mac-x64.dmg for an Intel Mac",
    notesLinks: "[Release notes for {version} on GitHub](notes), or [every version in the changelog](changelog).",
    nextTitle: "What happens next",
    nextAside:
      "CuePoint is not signed with a paid developer certificate, so Windows and macOS are careful about it the first time. Here is what you will see and what to do.",
    windowsTitle: "Windows",
    windows: {
      s1: "Run the installer you downloaded.",
      s2: "Your browser may ask whether to keep the file. Choose to keep it (in Edge, **Keep**, then **Keep anyway**).",
      s3: "Windows SmartScreen may say **Windows protected your PC**. Choose **More info**, then **Run anyway**.",
      updates:
        "You only do that once. After that CuePoint finds new versions itself and downloads them in the background. When one is ready, the status strip says so: choose **Restart now** to install it and come back, or **Later** to install it the next time you quit.",
    },
    macTitle: "Mac",
    mac: {
      s1: "Open the disk image, drag CuePoint to **Applications**, and open it from there.",
      s2: "If your Mac says CuePoint is damaged, or **\"CuePoint\" Not Opened** because Apple could not verify it, that is because the app is unsigned. Run this in Terminal, then open CuePoint again:",
      terminalLabel: "Terminal command",
      s3: "Still blocked after one try? Open **System Settings**, then **Privacy & Security**, scroll down, and choose **Open Anyway** next to CuePoint.",
      updates:
        "You only do that once. After that CuePoint finds new versions itself and downloads them in the background. When one is ready, the status strip says so: choose **Restart now** to install it and come back, or **Later** to install it the next time you quit. If CuePoint cannot replace itself where it is, for example when it runs from the disk image, it shows a **Download** link instead.",
    },
    linuxTitle: "Linux",
    linux: {
      s1: "Make the AppImage runnable, then run it:",
      terminalLabel: "Terminal command",
      s2: "The Linux build is experimental. It comes without the built-in music player.",
      updates:
        "CuePoint does not install updates on Linux. It tells you when a new version is out, with a **Download** link that opens the release page. Download the new AppImage and run it.",
    },
    updateByHand:
      "CuePoint does not update itself yet. To get a new version, download the new installer and install it over the old one. Your library stays where it is.",
    comingTitle: "CuePoint 1.0 is coming",
    comingLead:
      "CuePoint is free, and the first full version is not out yet. When it is, the download for your computer will be right here.",
    comingBody:
      "That opens CuePoint's page on GitHub. Choose **Watch**, then **Custom**, then **Releases**, and GitHub tells you when 1.0 is published.",
    requirementsTitle: "What CuePoint runs on",
    reqWindows: "**Windows:** Windows 10 or newer, 64-bit (x64).",
    reqMac:
      "**Mac:** macOS 14 or newer on Apple silicon (M1 and later), or macOS 15 or newer on an Intel chip. There is one download for each.",
    reqLinux:
      "**Linux:** 64-bit Intel or AMD, as an AppImage. This build is experimental and comes without the built-in music player.",
    reqRekordbox: "CuePoint also needs your Rekordbox collection, exported from Rekordbox as an XML file.",
    testBuildsTitle: "Want to try a test build?",
    testBuilds:
      "Test builds are early versions of 1.0, and they can be rough. They are on [GitHub Releases](releases) for anyone who wants to try one.",
  },
};

export type UiStrings = typeof en;
