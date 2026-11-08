import { APP_SHOTS as EN_APP_SHOTS, TRUST as EN_TRUST, type AppShotDef, type AppShotId, type Feature, type OpeningStep, type TrustClaim } from "../../home";
import { featureHref } from "../../features";

/**
 * Die Startseite auf Deutsch (DEC-311). Gleiche Fakten wie das Englische, du-Form, die Wörter aus
 * docs/translation.md bleiben englisch. Struktur und Nicht-Text-Felder prüft src/i18n/parity.test.ts.
 */

export const OPENING_STEPS: readonly OpeningStep[] = [
  {
    id: "messy",
    title: "Eine chaotische Bibliothek",
    text: "Jahre voller Tracks, und Key, BPM und Genre passen nicht zusammen. Bei manchen fehlt etwas, bei manchen stimmt etwas nicht.",
  },
  {
    id: "matched",
    title: "Mit Beatport abgeglichen",
    text: "CuePoint sucht jeden Track bei Beatport und holt dessen Key zurück, dazu bietet es BPM und Genre an. Treffer, bei denen es sich sicher ist, übernimmt es selbst. Den Rest überlässt es dir zur Prüfung.",
  },
  {
    id: "ready",
    title: "Aufgeräumt und bereit fürs DJ-Pult",
    text: "Deine Tracks reihen sich nach Key sortiert auf dem Camelot-Rad auf und gehen als neue Datei zurück zu Rekordbox. Deine eigenen Korrekturen haben Vorrang.",
  },
];

type ShotText = Pick<AppShotDef, "label" | "alt">;
const shot = (id: AppShotId, text: ShotText): AppShotDef => ({ ...EN_APP_SHOTS[id], ...text });

export const APP_SHOTS: Readonly<Record<AppShotId, AppShotDef>> = {
  window: shot("window", {
    label: "Das CuePoint-Fenster",
    alt: "Das CuePoint-Fenster mit einer Bibliothek voller Tracks. Das Camelot-Rad ist auf den Key des laufenden Tracks geöffnet und leuchtet in den Keys, die dazu passen.",
  }),
  clean: shot("clean", {
    label: "Clean",
    alt: "Der Match-Bereich der Seite Clean: die Tracks, die nach dem Abgleich mit Beatport noch zu prüfen sind, jeweils neben dem, was Beatport dafür gefunden hat.",
  }),
  "clean-compare": shot("clean-compare", {
    label: "Clean: Track für Track",
    alt: "Das Panel „Check the match“ in Clean: ein Track aus der Bibliothek neben den Kandidaten, die Beatport gefunden hat, mit „Use this match“ und „None of these“.",
  }),
  library: shot("library", {
    label: "The Library",
    alt: "Die Seite Library: die Tabelle mit den Tracks, daneben die Collections und Playlists. Ein Track ist ausgewählt, die Aktionen dafür stehen über der Tabelle.",
  }),
  keys: shot("keys", {
    label: "Keys",
    alt: "Die Seite Keys: die Keys von drei Playlists, auf dem Camelot-Rad gezählt. Der Key mit den meisten Tracks ist ausgewählt.",
  }),
  discover: shot("discover", {
    label: "Discover",
    alt: "Die Seite Discover nach einer Suche: neue Tracks aus einem Beatport-Chart von Artists aus der Bibliothek, mit ihren Artists und Labels.",
  }),
  prepare: shot("prepare", {
    label: "Prepare",
    alt: "Die Seite Prepare: ein Set als Ablauf in Kapiteln, mit den Checks zwischen den Tracks und dem geöffneten Übergangsstreifen bei einem davon.",
  }),
  statistics: shot("statistics", {
    label: "Statistics",
    alt: "Die Übersicht der Seite Statistics: wie sich die ganze Bibliothek auf Genre, Label und Artist verteilt, mit der Anzahl an jedem Balken.",
  }),
  waveforms: shot("waveforms", {
    label: "Waveforms und der Player",
    alt: "Die Player-Leiste mit der Waveform eines pausierten Tracks, und die Track details mit der Waveform des ganzen Tracks. Darunter stehen seine Cue-Punkte.",
  }),
  export: shot("export", {
    label: "Export to Rekordbox",
    alt: "Das Fenster „Export to Rekordbox“: wie viele Tracks und Playlists die neue Rekordbox-Datei enthalten wird und was hineinkommt, bevor irgendetwas geschrieben wird.",
  }),
};

const more = (slug: string) => ({ label: "Mehr erfahren", path: featureHref(slug) });

export const FEATURES: readonly Feature[] = [
  {
    id: "clean",
    name: "Clean",
    text: "Gleiche eine Playlist oder deine ganze Bibliothek mit Beatport ab und prüfe nur die Treffer, bei denen sich CuePoint nicht sicher ist.",
    learnMore: more("clean"),
  },
  {
    id: "library",
    name: "The Library",
    text: "Durchsuche deine ganze Sammlung und filtere sie nach Key, BPM oder Genre, mit dem Beatport-Key bei jedem abgeglichenen Track.",
    learnMore: more("library"),
  },
  {
    id: "discover",
    name: "Discover",
    text: "Finde neue Musik auf Beatport von den Artists und Labels, die schon in deiner Bibliothek sind.",
    learnMore: more("discover"),
  },
  {
    id: "prepare",
    name: "Prepare",
    text: "Plane ein Set als Ablauf, und CuePoint weist dich auf einen Key-Clash oder ein Tempo hin, das nicht passt.",
    learnMore: more("prepare"),
  },
  {
    id: "export",
    name: "Export to Rekordbox",
    text: "Schreibe deine Keys, BPM-Werte und Genres in eine neue Rekordbox-XML-Datei. Die Datei, die du importiert hast, wird nie verändert.",
    learnMore: more("export"),
  },
];

type TrustText = Pick<TrustClaim, "id" | "title" | "text">;
const TRUST_TEXT: readonly TrustText[] = [
  { id: "free", title: "Kostenlos", text: "Kostenlos herunterzuladen und zu benutzen." },
  {
    id: "local",
    title: "Läuft auf deinem Computer",
    text: "Deine Bibliothek bleibt auf deinem Computer. CuePoint geht nur online, um Tracks bei Beatport nachzuschlagen, wenn du es willst, um bei GitHub nach einer neuen Version zu fragen und um Fehlerberichte ohne deine Namen zu senden, was du abschalten kannst.",
  },
  {
    id: "yours",
    title: "Deine Bibliothek bleibt deine",
    text: "CuePoint löscht oder verschiebt nie deine Musikdateien, und bevor es Tags schreibt oder exportiert, zeigt es eine Vorschau: Ohne deine Bestätigung passiert nichts.",
  },
  { id: "open", title: "Open Source", text: "Der Code ist auf GitHub öffentlich, unter der Apache-2.0-Lizenz." },
  {
    id: "rekordbox",
    title: "Gemacht für Rekordbox",
    text: "CuePoint liest die Sammlung, die du aus Rekordbox als XML exportierst, und schreibt eine neue XML-Datei zurück, die Rekordbox importieren kann.",
  },
];

export const TRUST: readonly TrustClaim[] = TRUST_TEXT.map((t) => ({
  ...t,
  evidence: EN_TRUST.find((e) => e.id === t.id)!.evidence,
}));

export const HERO = {
  heading: "Deine Rekordbox-Bibliothek, aufgeräumt und bereit fürs DJ-Pult",
  lead: "CuePoint ist eine kostenlose Desktop-App für DJs. Sie gleicht deine Tracks mit Beatport ab, ergänzt fehlende oder falsche Keys und BPM-Werte und schickt das Ergebnis zurück zu Rekordbox.",
  title: "CuePoint: Rekordbox-Bibliothek aufräumen",
  description:
    "CuePoint, kostenlose Desktop-App für DJs: Rekordbox-Bibliothek mit Beatport abgleichen, Keys und BPM korrigieren, Keys auf dem Camelot-Rad sehen, Sets planen.",
} as const;
