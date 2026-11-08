import type { UiStrings } from "./en";

/**
 * Die Oberflächentexte auf Deutsch (DEC-311): alles, was die übersetzten Seiten und der gemeinsame Rahmen
 * selbst sagen. Du-Form. Gleiche Schlüssel wie en.ts (der Typ erzwingt das), gleiche Platzhalter {name} und
 * gleiche Markierungen (**fett**, [Linktext](schlüssel)). Die Wörter aus docs/translation.md bleiben englisch.
 */
const de: UiStrings = {
  language: {
    label: "Sprache",
    switchLabel: "Sprache wählen",
  },
  consent: {
    title: "Besuche zählen",
    body: "Diese Seite hat ein Cookie gefunden, das sie nicht selbst gesetzt hat: {names}. Gezählt wird erst, wenn du dich entscheidest.",
    yes: "Zählen erlauben",
    no: "Nein danke",
  },
  inEnglish: "auf Englisch",
  skipLink: "Zum Hauptinhalt springen",
  menu: "Menü",
  mainNav: "Hauptnavigation",
  footerNav: "Fußzeile",
  breadcrumb: "Navigationspfad",
  nav: {
    home: "Start",
    features: "Funktionen",
    guide: "Anleitung",
    faq: "FAQ",
    download: "Download",
    blog: "Blog",
    compare: "Vergleich",
    changelog: "Änderungsprotokoll",
    contact: "Kontakt",
    reportBug: "Fehler melden",
    privacy: "Datenschutz",
    terms: "Nutzungsbedingungen",
  },
  external: {
    github: "GitHub",
  },
  footer: {
    product: "Produkt",
    help: "Hilfe",
    legal: "Rechtliches",
    tagline: "Eine kostenlose Desktop-App, die deine Rekordbox-Bibliothek aufräumt.",
    legalLine: "© {year} {publisher}. {site} ist kostenlose Software für DJs.",
  },
  appNote: "Die App selbst ist auf Englisch. Bereiche wie Clean, Library und Keys heißen hier genauso wie in der App.",
  primaryAction: "Benachrichtigen, wenn 1.0 da ist",
  primaryActionShort: "Benachrichtigen",
  downloadLabel: {
    neutral: "Download",
    windows: "Für Windows herunterladen",
    macos: "Für Mac herunterladen",
    linux: "Für Linux herunterladen",
  },
  downloadedTimes: {
    one: "{count} Mal heruntergeladen",
    other: "{count} Mal heruntergeladen",
  },
  unshipped: {
    compact: "Hinweis zur Vorschau: noch nicht in der App (kommt mit {step}).",
    title: "Hinweis zur Vorschau: noch nicht in der App.",
    body: "Das beschreibt etwas, das mit {step} erscheint. Ein öffentlicher Build schlägt fehl, bis dieser Hinweis entfernt ist.",
  },
  appShot: {
    placeholderTag: "Screenshot-Platzhalter",
    placeholderSize: "{width} mal {height}, die Originalgröße der App",
    placeholderCaption: "Screenshot-Platzhalter: Das echte Bild folgt. Es zeigt: {alt}",
    placeholderLowerFirst: false,
  },
  sound: "Ton",
  home: {
    seeHow: "So funktioniert es",
    howItWorks: "So funktioniert es",
    whatTitle: "Was CuePoint macht",
    aboutName: "zu {name}",
    allFeatures: "Alle Funktionen von CuePoint",
    trustTitle: "Worauf du dich verlassen kannst",
    seeCode: "Den Code auf GitHub ansehen",
    getTitle: "Hol dir CuePoint",
    getTextRelease: "CuePoint ist kostenlos für Windows, Mac und Linux.",
    getTextNone:
      "CuePoint 1.0 ist noch nicht erschienen. Lass dich auf GitHub benachrichtigen, wenn es so weit ist. Es wird kostenlos für Windows, Mac und Linux sein.",
    frameAlt: {
      messy: "Eine Kiste mit Platten in schlichten grauen Hüllen, dahinter ein leeres Camelot-Rad.",
      matched: "Die Platten hängen in einem Raster, jede mit ihrem Key beschriftet, etwa 8A oder 11B.",
      ready: "Das Camelot-Rad leuchtet, jede Platte steht an der Stelle ihres Keys, und jede Zelle zeigt ihren Key.",
    },
  },
  features: {
    pageTitle: "Was CuePoint für deine Bibliothek tut",
    lead: "CuePoint ist eine kostenlose Desktop-App: Sie gleicht die Sammlung, die du aus Rekordbox exportierst, mit Beatport ab und hilft dir, sie sauber zu halten. Jeder Teil hat seine eigene Seite.",
    listTitle: "Die Funktionen",
    compareTitle: "Im Vergleich mit anderen Tools",
    compareIntro:
      "Nicht sicher, ob CuePoint das richtige Tool für dich ist? Diese Seiten stellen es neben andere, und jede Aussage über das andere Tool ist mit dessen eigener Seite verlinkt und datiert.",
    compareRow: "CuePoint und {name}",
    getTitle: "Hol dir CuePoint",
    howTitle: "So hilft dir CuePoint: {name}",
    notTitle: "Was es nicht tut",
    nextTitle: "Weiter geht's",
    guideNote: "Alle Schritte stehen in der Anleitung.",
    allFeatures: "Alle Funktionen von CuePoint",
    allFeaturesNote: "Jeder Teil in einer Zeile.",
    propAlt: {
      clean: "Ein Pixel-Plattenspieler mit einer Platte darauf.",
      keys: "Ein Pixel-Camelot-Rad mit einer Säule auf jedem Key, höher dort, wo es mehr Tracks gibt.",
      waveforms: "Die Waveform eines Tracks, als Landschaft aus Pixelsäulen gezeichnet, mit einem Abspielkopf quer darüber.",
    },
  },
  compare: {
    pageTitle: "CuePoint im Vergleich mit anderen DJ-Tools",
    pageDescription:
      "CuePoint neben Lexicon, Mixed In Key und OpenKeyScan: Fakten zu jedem Tool, mit dessen eigener Seite verlinkt und datiert, und was CuePoint nicht macht.",
    headTitle: "CuePoint im Vergleich mit anderen Tools",
    lead: "DJs benutzen schon gute Tools, um eine Bibliothek zu pflegen. Diese Seiten stellen CuePoint neben drei davon, damit du siehst, was jedes davon macht, und das nimmst, das zu dir passt.",
    listTitle: "Die Vergleiche",
    rowName: "CuePoint und {name}",
    howTitle: "So sind diese Seiten geschrieben",
    how1: "Jede Aussage über ein anderes Tool verlinkt die Seite dieses Tools, auf der wir sie gelesen haben, und nennt das Datum dazu.",
    how2: "Jede Seite sagt, was CuePoint nicht macht.",
    how3: "Tools ändern sich. Diese Seiten wurden zuletzt am {date} geprüft. Wenn etwas veraltet ist, [sag uns Bescheid](contact), und wir korrigieren es.",
    sideTitle: "Nebeneinander",
    caption: "CuePoint und {name}, Thema für Thema",
    topic: "Thema",
    source: "Quelle: {link}, gelesen am {date}.",
    chooseTitle: "Was besser passt",
    chooseOther: "Wähle {name}, wenn",
    chooseCuePoint: "Wähle CuePoint, wenn",
    notTitle: "Was CuePoint nicht macht",
    note: "Was wir über {name} sagen, stammt von dessen eigenen öffentlichen Seiten, Stand der genannten Tage, und Tools ändern sich. Sieh dir [die Clean-Seite von CuePoint](clean) oder [die anderen Vergleiche](compare) an.",
  },
  faq: {
    title: "Häufige Fragen | CuePoint",
    description:
      "Antworten zu CuePoint: ob es kostenlos ist, was es mit deiner Rekordbox-Bibliothek macht, was es sendet, wie es sich aktualisiert und wie du Fehler meldest.",
    heading: "Häufig gestellte Fragen",
    lead: "Erst die kurze Antwort, dazu ein Link zu dem Teil der [Anleitung](guide), der tiefer einsteigt.",
    jumpTitle: "Die Fragen",
    moreAbout: "Mehr zu: {question}",
  },
  download: {
    title: "CuePoint herunterladen",
    titleWithVersion: "CuePoint {version} herunterladen",
    descriptionRelease:
      "CuePoint {version} herunterladen, kostenlos für Windows, macOS und Linux. Jede Datei mit Größe und Prüfsumme und was dich beim ersten Start erwartet.",
    descriptionNone:
      "CuePoint 1.0 ist noch nicht da. Sieh, worauf es laufen wird, und lass dich benachrichtigen, wenn der kostenlose Download für Windows, Mac und Linux bereit ist.",
    lead: "Kostenlos, für Windows, macOS und Linux.",
    version: "Version {version}",
    releaseNotes: "Versionshinweise",
    releaseNotesFor: "zu {version}",
    notes: {
      windows: "Der Installer für 64-Bit-Windows. Windows warnt dich beim ersten Mal womöglich: [so gehst du vor](windows).",
      windowsArm:
        "Dein PC hat einen Arm-Chip. CuePoint hat keine Arm-Version, das hier ist also der 64-Bit-Installer (x64), den Windows 11 auf Arm über seine eingebaute Emulation ausführt, und er läuft deshalb vielleicht langsamer. [Was dich erwartet](windows).",
      macArm: "Für Macs mit Apple Silicon (M1 und neuer). [Intel-Mac?](all) [Was dich erwartet](macos).",
      macArmGuess:
        "Dein Browser verrät nicht, welchen Chip dein Mac hat, deshalb ist das die Apple-Silicon-Version (M1 und neuer). [Intel-Mac?](all) [Was dich erwartet](macos).",
      macIntel: "Für Macs mit Intel-Chip. [Mac mit Apple Silicon?](all) [Was dich erwartet](macos).",
      linux: "Das AppImage für 64-Bit-Linux. [Erst ausführbar machen](linux).",
      linuxArm: "Der Linux-Build von CuePoint ist für 64-Bit-Computer mit Intel und AMD. Für Arm gibt es keine Version.",
      unknown: "Wir konnten nicht erkennen, welches System du benutzt. Such dir deins aus [der Liste unten](all).",
      mobile: "CuePoint läuft unter Windows, macOS und Linux. Öffne diese Seite auf deinem Computer, um es herunterzuladen.",
    },
    allTitle: "Alle Downloads",
    allAsideBefore: "Jede Datei der Version {version}",
    allAsideWide: ", falls du ein anderes System brauchst oder der Button das falsche gewählt hat.",
    allAsidePhone: ". Such dir dein System aus.",
    kinds: {
      "windows-x64": { title: "Windows", detail: "Installer für 64-Bit-Windows 10 oder neuer" },
      "macos-arm64": { title: "Mac, Apple Silicon", detail: "Disk-Image für M1 und neuer" },
      "macos-x64": { title: "Mac, Intel", detail: "Disk-Image für Macs mit Intel-Chip" },
      "linux-x64": { title: "Linux", detail: "AppImage für 64-Bit-Computer mit Intel und AMD" },
    },
    checksum: "SHA-256-Prüfsumme",
    downloadButton: "Herunterladen",
    downloadFor: "CuePoint für {title} herunterladen",
    verifyTitle: "So prüfst du einen Download",
    verifyIntro: "Führe einen dieser Befehle für die heruntergeladene Datei aus und vergleiche das Ergebnis mit ihrer SHA-256-Prüfsumme oben.",
    codeWindows: "Windows-Befehl",
    codeMac: "Mac-Befehl",
    codeLinux: "Linux-Befehl",
    codeMacComment: "# oder -mac-x64.dmg für einen Intel-Mac",
    notesLinks: "[Versionshinweise zu {version} auf GitHub](notes) oder [alle Versionen im Änderungsprotokoll](changelog).",
    nextTitle: "Was als Nächstes passiert",
    nextAside:
      "CuePoint ist nicht mit einem bezahlten Entwicklerzertifikat signiert, deshalb gehen Windows und macOS beim ersten Mal vorsichtig damit um. Hier steht, was du sehen wirst und was du tun kannst.",
    windowsTitle: "Windows",
    windows: {
      s1: "Starte den Installer, den du heruntergeladen hast.",
      s2: "Dein Browser fragt womöglich, ob du die Datei behalten willst. Behalte sie (in Edge **Beibehalten**, dann **Trotzdem beibehalten**).",
      s3: "Windows SmartScreen zeigt womöglich **Der Computer wurde durch Windows geschützt**. Wähle **Weitere Informationen**, dann **Trotzdem ausführen**.",
      updates:
        "Das musst du nur einmal tun. Danach findet CuePoint neue Versionen selbst und lädt sie im Hintergrund herunter. Wenn eine bereit ist, zeigt die Statusleiste das an: Wähle **Restart now**, um sie zu installieren und gleich weiterzumachen, oder **Later**, um sie beim nächsten Beenden zu installieren.",
    },
    macTitle: "Mac",
    mac: {
      s1: "Öffne das Disk-Image, ziehe CuePoint in den Ordner **Programme** und öffne es von dort.",
      s2: "Wenn dein Mac sagt, CuePoint sei beschädigt, oder **„CuePoint“ wurde nicht geöffnet** meldet, weil Apple es nicht überprüfen konnte, liegt das daran, dass die App nicht signiert ist. Führe das im Terminal aus und öffne CuePoint dann noch einmal:",
      terminalLabel: "Terminal-Befehl",
      s3: "Nach einem Versuch immer noch blockiert? Öffne die **Systemeinstellungen**, dann **Datenschutz & Sicherheit**, scrolle nach unten und wähle **Dennoch öffnen** neben CuePoint.",
      updates:
        "Das musst du nur einmal tun. Danach findet CuePoint neue Versionen selbst und lädt sie im Hintergrund herunter. Wenn eine bereit ist, zeigt die Statusleiste das an: Wähle **Restart now**, um sie zu installieren und gleich weiterzumachen, oder **Later**, um sie beim nächsten Beenden zu installieren. Wenn CuePoint sich dort, wo es liegt, nicht ersetzen kann, zum Beispiel weil es aus dem Disk-Image läuft, zeigt es stattdessen einen **Download**-Link.",
    },
    linuxTitle: "Linux",
    linux: {
      s1: "Mach das AppImage ausführbar und starte es dann:",
      terminalLabel: "Terminal-Befehl",
      s2: "Der Linux-Build ist experimentell. Er kommt ohne den eingebauten Musik-Player.",
      updates:
        "CuePoint installiert unter Linux keine Updates. Es sagt dir, wenn eine neue Version erschienen ist, mit einem **Download**-Link, der die Release-Seite öffnet. Lade das neue AppImage herunter und starte es.",
    },
    updateByHand:
      "CuePoint aktualisiert sich noch nicht selbst. Um eine neue Version zu bekommen, lädst du den neuen Installer herunter und installierst ihn über die alte. Deine Bibliothek bleibt, wo sie ist.",
    comingTitle: "CuePoint 1.0 kommt",
    comingLead:
      "CuePoint ist kostenlos, und die erste vollständige Version ist noch nicht erschienen. Wenn es so weit ist, steht der Download für deinen Computer genau hier.",
    comingBody:
      "Das öffnet die Seite von CuePoint auf GitHub. Wähle **Watch**, dann **Custom**, dann **Releases**, und GitHub sagt dir Bescheid, wenn 1.0 veröffentlicht wird.",
    requirementsTitle: "Worauf CuePoint läuft",
    reqWindows: "**Windows:** Windows 10 oder neuer, 64 Bit (x64).",
    reqMac:
      "**Mac:** macOS 14 oder neuer auf Apple Silicon (M1 und neuer) oder macOS 15 oder neuer auf einem Intel-Chip. Es gibt für jeden einen Download.",
    reqLinux:
      "**Linux:** 64-Bit-Intel oder -AMD, als AppImage. Dieser Build ist experimentell und kommt ohne den eingebauten Musik-Player.",
    reqRekordbox: "CuePoint braucht außerdem deine Rekordbox-Sammlung, aus Rekordbox als XML-Datei exportiert.",
    testBuildsTitle: "Lust, einen Test-Build auszuprobieren?",
    testBuilds:
      "Test-Builds sind frühe Versionen von 1.0 und können holprig sein. Sie liegen auf [GitHub Releases](releases) für alle, die einen ausprobieren wollen.",
  },
};

export default de;
