import { COMPARE_CHECKED, type CompareTool, type OtherFact, type Source } from "../../compare";

/**
 * Die Vergleichsseiten auf Deutsch (DEC-311). Die Adressen, die Daten und die Reihenfolge der Quellen sind
 * die des Englischen (src/i18n/parity.test.ts prüft das); übersetzt sind die Texte und die Namen der Links.
 * Zitate aus den Seiten der anderen Tools bleiben im englischen Wortlaut, denn sie sind wörtlich zitiert.
 */

const at = (url: string, label: string): Source => ({ url, label });
const fact = (text: string, source: Source): OtherFact => ({ text, source, checked: COMPARE_CHECKED });

const LEXICON_HOME = at("https://www.lexicondj.com/", "Startseite von Lexicon");
const LEXICON_PRICING = at("https://www.lexicondj.com/pricing", "Preisseite von Lexicon");
const MIK_HOME = at("https://mixedinkey.com/", "Startseite von Mixed In Key");
const MIK_MORE = at("https://mixedinkey.com/learn-more/", "Seite zu Mixed In Key 11");
const MIK_REKORDBOX = at("https://mixedinkey.com/integration/rekordbox-integration/", "Rekordbox-Seite von Mixed In Key");
const MIK_WORKFLOW = at(
  "https://mixedinkey.com/workflows/use-mixed-in-key-with-rekordbox/",
  "Anleitung von Mixed In Key zur Nutzung mit Rekordbox",
);
const OKS_HOME = at("https://www.openkeyscan.com/", "Startseite von OpenKeyScan");
const REKORDCLOUD = at("https://rekord.cloud/", "Startseite von rekordcloud");

export const COMPARE_TOOLS: readonly CompareTool[] = [
  {
    slug: "lexicon",
    name: "Lexicon",
    maker: "rekordcloud",
    hosts: ["lexicondj.com", "rekord.cloud"],
    title: "CuePoint und Lexicon im Vergleich | CuePoint",
    description:
      "CuePoint und Lexicon (von rekordcloud) im Vergleich: was beide mit deiner DJ-Bibliothek machen, mit welchen DJ-Apps sie arbeiten und was CuePoint nicht macht.",
    heading: "CuePoint und Lexicon (rekordcloud)",
    intro:
      "Beide helfen dir, eine DJ-Bibliothek zu pflegen. Jede Aussage über Lexicon unten stammt von dessen eigenen öffentlichen Seiten, mit dem Datum, an dem wir sie gelesen haben. Was CuePoint tut, stammt aus seiner Anleitung.",
    summary: "Library-Verwaltung über mehrere DJ-Apps hinweg, neben dem Beatport-Abgleich von CuePoint für Rekordbox.",
    rows: [
      {
        topic: "Hersteller",
        other: fact(
          "Die Startseite von rekordcloud nennt Lexicon, TrackHack, OpenKeyScan und SonoVault als seine Produkte. Wenn du nach rekordcloud gesucht hast: Lexicon ist dessen Suite zur Bibliotheksverwaltung für DJs.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint ist kostenlos und Open Source, unter der Apache-2.0-Lizenz.",
      },
      {
        topic: "Was es ist",
        other: fact("Auf der Startseite von Lexicon steht: „Organize, clean and upgrade your DJ library.“", LEXICON_HOME),
        cuepoint:
          "CuePoint gleicht deine Rekordbox-Tracks mit Beatport ab, ergänzt Keys und andere Werte, findet Duplikate und fehlende Dateien und schickt das Ergebnis zurück zu Rekordbox.",
      },
      {
        topic: "Welche DJ-Apps",
        other: fact(
          "Lexicon nennt Rekordbox, Serato, Traktor, VirtualDJ, Engine DJ und djay Pro und wandelt Playlists, Cue-Punkte und Beatgrids zwischen ihnen um.",
          LEXICON_HOME,
        ),
        cuepoint: "CuePoint arbeitet nur mit Rekordbox. Es liest die Sammlung, die du aus Rekordbox als XML exportierst.",
      },
      {
        topic: "Duplikate und fehlende Dateien",
        other: fact(
          "Lexicon findet doppelte Tracks sowie defekte oder fehlende Tracks. Auf der Preisseite steht Find Duplicates im Tarif Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "Clean gruppiert mögliche Duplikate und listet fehlende Dateien, kostenlos. Es führt nie etwas zusammen und löscht nichts.",
      },
      {
        topic: "Fehlende Tags und Artwork",
        other: fact(
          "Lexicon findet fehlende Tags und Album-Cover. Auf der Preisseite steht Find Missing Tags & Album Art im Tarif Ultimate.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "CuePoint sucht jeden Track bei Beatport und gibt ihm den Beatport-Key, und es bietet dessen BPM, Genre, Label und Jahr an. Artwork liest es aus deinen Dateien und, bei übernommenen Treffern, von Beatport.",
      },
      {
        topic: "Cue-Punkte",
        other: fact("Lexicon hat ein Tool namens Generate Cue Points, das Cues in großen Mengen erzeugt.", LEXICON_HOME),
        cuepoint:
          "CuePoint erzeugt keine Cue-Punkte. Es behält die Cues und Beatgrids, die Rekordbox geschrieben hat, genau so, wie sie waren.",
      },
      {
        topic: "Apps fürs Handy",
        other: fact("Lexicon hat Apps für iPhone und Android.", LEXICON_HOME),
        cuepoint: "CuePoint ist nur eine Desktop-App.",
      },
      {
        topic: "Computer",
        other: fact("Lexicon sagt, es läuft unter Windows und macOS.", LEXICON_HOME),
        // support-policy.md: Windows 10+ (x64), macOS 14+ on Apple Silicon (15+ on Intel, DEC-296), Linux experimental
        cuepoint:
          "CuePoint läuft unter Windows und auf Macs mit Apple Silicon, und es gibt einen experimentellen Linux-Build. Die Seite Download sagt, was verfügbar ist.",
      },
      {
        topic: "Preis",
        other: fact(
          "Auf der Preisseite von Lexicon steht ein Tarif Free mit Bibliotheks-Konvertierung, Essential ab 10,49 $ im Monat oder 249 $ einmalig auf Lebenszeit und Ultimate ab 20,99 $ im Monat oder 499 $ einmalig auf Lebenszeit.",
          LEXICON_PRICING,
        ),
        cuepoint: "CuePoint ist kostenlos.",
      },
    ],
    cuepointDoesNot: [
      "Es wandelt keine Bibliothek zwischen DJ-Apps um. Es arbeitet nur mit Rekordbox.",
      "Es erzeugt keine Cue-Punkte und setzt keine Beatgrids.",
      "Es hat keine Handy-App und keinen Cloud-Speicher.",
      "Es beobachtet keinen Ordner auf neue Tracks.",
    ],
    chooseOther:
      "Wenn du mehr als eine DJ-App benutzt oder eine Bibliothek von einer in die andere umziehen willst, ist Lexicon dafür gebaut und CuePoint nicht.",
    chooseCuePoint:
      "Wenn du aus Rekordbox spielst und seine Keys und anderen Werte mit Beatport prüfen willst, mit jedem Treffer nachprüfbar und ohne dass etwas gelöscht wird, ist CuePoint dafür gebaut. Du kannst auch beide benutzen.",
  },
  {
    slug: "mixed-in-key",
    name: "Mixed In Key",
    maker: "Mixed In Key",
    hosts: ["mixedinkey.com"],
    title: "CuePoint und Mixed In Key im Vergleich | CuePoint",
    description:
      "CuePoint und Mixed In Key im Vergleich: woher beide den Key nehmen, was es in Rekordbox schreibt, Energy-Bewertungen, Cue-Punkte und was CuePoint fehlt.",
    heading: "CuePoint und Mixed In Key",
    intro:
      "Beide können deinen Tracks einen Key geben, nach dem du mixen kannst. Jede Aussage über Mixed In Key unten stammt von dessen eigenen öffentlichen Seiten, mit dem Datum, an dem wir sie gelesen haben. Was CuePoint tut, stammt aus seiner Anleitung.",
    summary: "Key- und Energy-Analyse aus dem Audio, neben Keys aus Beatport-Treffern.",
    rows: [
      {
        topic: "Was es ist",
        other: fact(
          "Die Startseite von Mixed In Key beschreibt Mixed In Key so: „Discover the key and BPM of any track to create harmonically perfect DJ sets.“",
          MIK_HOME,
        ),
        cuepoint:
          "CuePoint gleicht deine Tracks mit Beatport ab, ergänzt, was fehlt oder falsch ist, und schickt es dann zurück zu Rekordbox.",
      },
      {
        topic: "Woher der Key kommt",
        other: fact(
          "Mixed In Key 11 schreibt: „Analyze your music collection“. Seine Key-Erkennung nennt es „the world's most precise key-detection technology.“",
          MIK_MORE,
        ),
        cuepoint:
          "CuePoint berechnet keinen Key aus dem Audio. Der Key eines Tracks ist der, den du eingetippt hast, oder der Key seines übernommenen Beatport-Treffers. Ein Track, den Beatport nicht hat, hat keinen Key, bis du ihm einen gibst.",
      },
      {
        topic: "Energy",
        other: fact(
          "Die Startseite von Mixed In Key sagt, seine Energy-Level-Bewertungen „show you how danceable each track is.“",
          MIK_HOME,
        ),
        cuepoint: "CuePoint hat keine Energy-Bewertung.",
      },
      {
        topic: "Cue-Punkte",
        other: fact(
          "Mixed In Key 11 sagt, es „will give you up to 8 automatic Cue Points per track.“",
          MIK_MORE,
        ),
        cuepoint: "CuePoint erzeugt keine Cue-Punkte. Es behält die, die Rekordbox hat.",
      },
      {
        topic: "Wie die Ergebnisse in Rekordbox landen",
        other: fact(
          "Die Rekordbox-Seite von Mixed In Key sagt, du sollst deine Dateien in Mixed In Key analysieren, sie zu Rekordbox hinzufügen und dann ihre Tags neu laden, und dass Key- und Energy-Ergebnisse aktualisiert werden.",
          MIK_REKORDBOX,
        ),
        cuepoint:
          "CuePoint schreibt eine neue Rekordbox-XML-Datei, die du in Rekordbox öffnest, mit erhaltenen Cues und Beatgrids. Es kann nach einer Vorschau auch Tags in deine Dateien schreiben. Rekordbox zeigt sie, nachdem du Reload Tag gewählt hast.",
      },
      {
        topic: "Cue-Punkte in Rekordbox",
        other: fact(
          "Die Anleitung von Mixed In Key sagt, Cue-Punkte gehören nicht zum Neuladen der Tags: „Cue Points require the Rekordbox XML import workflow.“",
          MIK_WORKFLOW,
        ),
        cuepoint:
          "Der Export von CuePoint ist eine angepasste Kopie des XML, das du importiert hast, deshalb werden die Cues und Beatgrids, die Rekordbox geschrieben hat, genau so übernommen, wie sie waren.",
      },
      {
        topic: "Wo die Ergebnisse in Rekordbox erscheinen",
        other: fact(
          "Standardmäßig gehen die Key-Ergebnisse von Mixed In Key in die Spalte Key und die Spalte Comments von Rekordbox. In den Einstellungen Update Tags lässt sich das ändern.",
          MIK_REKORDBOX,
        ),
        cuepoint:
          "Der Export von CuePoint schreibt den Key in das Key-Feld der neuen XML-Datei, in der Notation, die du wählst.",
      },
      {
        topic: "Camelot-Notation",
        other: fact("Die Startseite von Mixed In Key nennt ein Camelot Wheel für harmonisches Mixen.", MIK_HOME),
        cuepoint:
          "CuePoint zeigt den Key eines Tracks in Camelot-Notation, etwa 8A, und sagt „No Beatport key“, wenn ein Track keinen hat. Der Key von Rekordbox selbst wird als nicht benutzt angezeigt.",
      },
      {
        topic: "Preis",
        other: fact(
          "Mixed In Key 11 wird als Einmalkauf verkauft. Auf den Seiten, die wir gelesen haben, steht kein Betrag; den Preis nennt der Shop.",
          MIK_MORE,
        ),
        cuepoint: "CuePoint ist kostenlos.",
      },
    ],
    cuepointDoesNot: [
      "Es berechnet keinen Key aus dem Audio. Einen Track, den Beatport nicht hat, kann es nicht mit einem Key versehen.",
      "Es bewertet nicht die Energy eines Tracks.",
      "Es erzeugt keine Cue-Punkte.",
      "Es hat keine Tools zum Musikmachen oder für Mashups.",
    ],
    chooseOther:
      "Wenn deine Tracks nicht auf Beatport sind oder du einen Key aus dem Klang selbst berechnen lassen willst, dazu Energy-Bewertungen und automatische Cue-Punkte, kann Mixed In Key das und CuePoint nicht.",
    chooseCuePoint:
      "Wenn deine Tracks auf Beatport sind und du Key, BPM, Genre, Label und Jahr von Beatport mit Rekordbox abgleichen willst, mit jedem Treffer nachprüfbar, kann CuePoint das kostenlos. Die beiden stören sich nicht, du kannst also beide benutzen.",
  },
  {
    slug: "openkeyscan",
    name: "OpenKeyScan",
    maker: "rekordcloud",
    hosts: ["openkeyscan.com", "rekord.cloud"],
    title: "CuePoint und OpenKeyScan im Vergleich | CuePoint",
    description:
      "CuePoint und OpenKeyScan von rekordcloud im Vergleich: wie beide den Key eines Tracks bestimmen, was offline geht, was es schreibt und was CuePoint nicht macht.",
    heading: "CuePoint und OpenKeyScan (rekordcloud)",
    intro:
      "Beide können einem Track einen Key geben. Jede Aussage über OpenKeyScan unten stammt von dessen eigenen öffentlichen Seiten oder denen seines Herstellers, mit dem Datum, an dem wir sie gelesen haben. Was CuePoint tut, stammt aus seiner Anleitung.",
    summary: "Ein kostenloser Key-Detektor, der auf das Audio hört, neben Keys von Beatport.",
    rows: [
      {
        topic: "Hersteller",
        other: fact(
          "Die Startseite von rekordcloud nennt OpenKeyScan neben Lexicon, TrackHack und SonoVault unter seinen Produkten und bezeichnet OpenKeyScan als kostenlose Open-Source-Desktop-App.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint ist kostenlos und Open Source, unter der Apache-2.0-Lizenz.",
      },
      {
        topic: "Was es ist",
        other: fact("Die Seite von OpenKeyScan beschreibt es als „a free, open-source key detector.“", OKS_HOME),
        cuepoint:
          "CuePoint ist eine kostenlose Open-Source-Desktop-App, die mehr kann als Keys: Sie gleicht Tracks mit Beatport ab, findet Duplikate und fehlende Dateien, entdeckt neue Musik und plant Sets.",
      },
      {
        topic: "Woher der Key kommt",
        other: fact(
          "OpenKeyScan sagt, es wandelt das Audio in ein Spektrogramm um und erkennt darin mit einem neuronalen Netz harmonische Muster.",
          OKS_HOME,
        ),
        cuepoint:
          "CuePoint berechnet keinen Key aus dem Audio. Es nimmt den Key aus dem übernommenen Beatport-Treffer oder von dir.",
      },
      {
        topic: "Offline",
        other: fact("OpenKeyScan sagt, es läuft „completely offline on your machine.“", OKS_HOME),
        cuepoint:
          "Deine Bibliothek bleibt auf deinem Computer. CuePoint geht online, um Beatport zu lesen (Abgleich, Artwork, Discover) und, sofern du es nicht abschaltest, um Fehlerberichte zu senden.",
      },
      {
        topic: "Was es schreibt",
        other: fact(
          "rekordcloud sagt, OpenKeyScan „writes results directly into your files for Rekordbox, Serato and Traktor.“",
          REKORDCLOUD,
        ),
        cuepoint:
          "CuePoint schreibt nur dann in deine Dateien, wenn du nach einer Vorschau „Write tags to files“ wählst, mit einem Protokoll, das jede Datei wiederherstellbar macht. Sein Export nach Rekordbox ist eine neue XML-Datei.",
      },
      {
        topic: "Preis",
        other: fact("OpenKeyScan sagt, es ist „100% free, forever.“", OKS_HOME),
        cuepoint: "CuePoint ist kostenlos.",
      },
    ],
    cuepointDoesNot: [
      "Es berechnet keinen Key aus dem Audio. Ein Track, den Beatport nicht hat, bekommt von CuePoint keinen Key.",
      "Der Abgleich geht nicht offline. Tracks bei Beatport nachzuschlagen braucht eine Verbindung.",
      "Es arbeitet nur mit Rekordbox, nicht mit Serato oder Traktor.",
    ],
    chooseOther:
      "Wenn du einen Key aus dem Klang eines Tracks berechnen und für Rekordbox, Serato und Traktor in die Datei schreiben lassen willst, ist OpenKeyScan dafür gemacht, und es läuft offline.",
    chooseCuePoint:
      "Wenn du den Key und die Metadaten von Beatport mit deiner Rekordbox-Bibliothek abgleichen willst, mit allem nachprüfbar, ist CuePoint dafür gemacht. Bei einem Track, den Beatport nicht hat, kannst du den Key selbst eintippen.",
  },
];
