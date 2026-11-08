import type { FeaturePage } from "../../features";

/**
 * Die Funktionsseiten auf Deutsch (DEC-311). Gleiche Fakten wie das Englische, du-Form. Namen der App
 * (Clean, Library, Keys, Discover, Prepare, Statistics, Waveforms, Match, Health, Track details, "Write tags
 * to files", "No Beatport key") und DJ-Wörter (Key, BPM, Cue, Hot Cue, Beatgrid, Playlist, Set, Track, Label,
 * Artist, Genre, Remix) bleiben englisch. Struktur und Nicht-Text-Felder prüft src/i18n/parity.test.ts.
 */

export const OVERVIEW = {
  title: "CuePoint-Funktionen für Rekordbox-DJs",
  description:
    "Alles, was CuePoint mit deiner Rekordbox-Bibliothek macht: Beatport-Abgleich, Keys korrigieren, neue Musik finden, Sets planen, Waveforms und Export.",
} as const;

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: "clean",
    name: "Clean",
    query: "Rekordbox Key-Tags korrigieren",
    title: "Rekordbox-Key-Tags mit Beatport korrigieren | CuePoint",
    description:
      "Gleiche Rekordbox-Tracks mit Beatport ab und ergänze fehlende oder falsche Keys, BPM, Genres und Labels. Prüfe Treffer, finde Duplikate und fehlende Dateien.",
    heading: "Korrigiere Keys und Tags in deiner Rekordbox-Bibliothek",
    summary: "Tracks mit Beatport abgleichen, Werte korrigieren, Duplikate und fehlende Dateien finden.",
    problem: [
      "Bei der Hälfte deiner Tracks fehlt der Key, oder er ist einer, dem du nicht traust. Bei manchen ist das Genre leer, bei anderen falsch. Derselbe Song steckt zweimal in der Sammlung, und ein paar Dateien liegen woanders, seit du ein Laufwerk umsortiert hast.",
      "Das von Hand zu beheben, Track für Track, kostet ein Wochenende. Die meisten DJs tun es nicht und wühlen dann beim Gig in den falschen Tracks.",
    ],
    how: [
      {
        heading: "Mit Beatport abgleichen, dann prüfen",
        paragraphs: [
          "Wähle eine Playlist, eine Collection, deine Auswahl oder die ganze Bibliothek und klicke auf Match. CuePoint sucht jeden Track bei Beatport und behält jeden Kandidaten, den es gefunden hat, mit einem Score und dem Grund, warum es die nicht gewählten abgelehnt hat.",
          "Einen Treffer übernimmt es nur dann von selbst, wenn der beste Kandidat 95 oder mehr Punkte hat und jede Prüfung besteht. Alles andere wartet in Match auf dich, ein Track neben seinem besten Beatport-Ergebnis, und die Tastatur erledigt die Arbeit: A korrigiert, R sagt „nicht dieser Track“, N überspringt.",
        ],
      },
      {
        heading: "Key, BPM, Genre, Label und Jahr",
        paragraphs: [
          "Ein übernommener Treffer gibt dem Track den Beatport-Key. BPM, Genre, Label und Jahr werden dir nebeneinander angeboten, und du hakst die an, die du übernehmen willst. Deine eigenen Werte kommen obendrauf, die von Rekordbox bleiben darunter, sodass sich jede Änderung zurücknehmen lässt.",
          "Titel, Artist, Remixer und Album werden nie verändert.",
        ],
      },
      {
        heading: "Duplikate und fehlende Dateien",
        paragraphs: [
          "Clean gruppiert Tracks, die dieselbe Aufnahme sein könnten: dieselbe Datei, derselbe Beatport-Track oder derselbe Artist, Titel und Mix. Es listet auch die Dateien auf, die fehlen oder sich nicht lesen lassen, und meldet ein Laufwerk, das nicht angeschlossen ist, einmal und nicht als Tausende fehlende Dateien.",
          "Ein Health-Tab zählt alles, was deine Aufmerksamkeit braucht, und jede Zahl öffnet die Library genau mit diesen Tracks.",
        ],
      },
    ],
    shot: "clean",
    doesNot: [
      "Es löscht nichts. Kein Track, keine Datei und keine Playlist wird entfernt, verschoben oder umbenannt. Um ein Duplikat loszuwerden, entfernst du es in Rekordbox und aktualisierst.",
      "Es verschiebt keine fehlenden Dateien. Das erledigt Relocate in Rekordbox, und Clean zeigt dir, welche Dateien du neu verknüpfen musst.",
      "Es rät nicht. Ein Track, den Beatport nicht hat, bekommt von CuePoint keinen Key, außer du tippst selbst einen ein.",
      "Es berechnet keinen Key aus dem Audio. Die Werte kommen von Beatport.",
    ],
    guide: { page: "clean", label: "Die Anleitung zu Clean lesen" },
    related: ["library", "export"],
  },
  {
    slug: "library",
    name: "The Library",
    query: "Rekordbox-Tracks nach Key und BPM filtern",
    title: "Deine Rekordbox-Bibliothek filtern und sortieren | CuePoint",
    description:
      "Durchsuche und filtere deine ganze Rekordbox-Sammlung nach Key, BPM und Genre, wähle deine Spalten und sieh alles, was CuePoint über einen Track weiß.",
    heading: "Finde den passenden Track in deiner ganzen Rekordbox-Sammlung",
    summary: "Suche, Filter und Spalten über deine ganze Sammlung.",
    problem: [
      "Du weißt, dass der nächste Track 124 bis 130 BPM haben soll, in einem Key, der zu dem passt, der gerade läuft. In einer langen Rekordbox-Liste heißt das scrollen und die Augen zusammenkneifen.",
    ],
    how: [
      {
        heading: "Alles durchsuchen, filtern und sortieren",
        paragraphs: [
          "Importiere die Sammlung, die du aus Rekordbox exportiert hast, und die Seite Library zeigt sie dir mit deinen Playlists links. Tippe, um Titel, Artists, Alben und Labels zu durchsuchen, oder füge Filter hinzu, etwa BPM zwischen 124 und 130, Genre ist Techno oder ein Kommentar, der ein Wort enthält. Filter lassen sich kombinieren, und die Leiste sagt dir, wie viele Tracks übrig sind.",
          "Wähle deine Spalten, klicke auf eine Überschrift zum Sortieren und klicke auf einen Track, um rechts in den Track details alles zu sehen, was CuePoint über ihn weiß.",
        ],
      },
      {
        heading: "Das Camelot-Rad",
        paragraphs: [
          "Ein Button neben der Suche, auf jeder Seite, öffnet ein Rad mit den 24 Keys. Es lässt den Key des ausgewählten oder des laufenden Tracks leuchten und die Keys, die dazu passen: dieselbe Zahl einen Schritt in beide Richtungen und den Parallel-Key.",
          "Klicke auf einen Key, und die Library zeigt dir jeden Track in diesem Key.",
        ],
      },
      {
        heading: "Keys sind von Beatport, oder von dir",
        paragraphs: [
          "Der Key eines Tracks ist der, den du eingetippt hast, oder sonst der Key seines übernommenen Beatport-Treffers, angezeigt in Camelot (8A). Der Key von Rekordbox selbst wird nie benutzt. Ein Track ohne beides hat keinen Key, und die Library sagt „No Beatport key“.",
        ],
      },
    ],
    shot: "library",
    doesNot: [
      "Stöbern verändert nichts. Dateien ändern sich nur, wenn du nach einer Vorschau „Write tags to files“ wählst.",
      "Es berechnet keinen Key aus dem Audio. Ein Track ohne Beatport-Treffer und ohne Key von dir hat keinen Key.",
      "Es benutzt den Key von Rekordbox nicht, weil die Keys von Rekordbox falsch sein können.",
    ],
    guide: { page: "library", label: "Die Anleitung zur Library lesen" },
    related: ["clean", "discover"],
    fromDecisions: ["DEC-133", "DEC-157", "DEC-160", "DEC-201"],
  },
  {
    slug: "keys",
    name: "Keys",
    query: "Keys in meiner Rekordbox-Playlist",
    title: "Die Keys deiner Rekordbox-Playlists sehen | CuePoint",
    description:
      "Zähle die Keys einer oder mehrerer Playlists, Collections oder Sets auf dem Camelot-Rad und liste die Tracks in den gewählten Keys. Kostenlos für Rekordbox-DJs.",
    heading: "Sieh, welche Keys deine Playlists enthalten",
    summary: "Die Keys einer oder mehrerer Playlists auf dem Camelot-Rad, mit Anzahl.",
    problem: [
      "Vor einem Gig willst du wissen, woraus die Kiste besteht. Ist alles 8A und 9A, oder gibt es nichts, was zu einem Opener in 3B passt? Rekordbox zählt dir die Keys nicht.",
    ],
    how: [
      {
        heading: "Playlists wählen, das Rad lesen",
        paragraphs: [
          "Keys ist eine eigene Seite in der Seitenleiste. Wähle die ganze Bibliothek oder hake mehrere Playlists, Collections und Sets an. CuePoint zählt jeden Key über alles, was du gewählt hast, und zeigt die Zahlen auf dem Camelot-Rad, dunkler, wo es mehr sind, und als Liste in Camelot-Reihenfolge. Ein Track, der in mehreren Quellen steckt, wird einmal gezählt.",
          "Die Zahlen stehen auf der Seite und werden nicht nur beim Darüberfahren gezeigt.",
        ],
      },
      {
        heading: "Dann die Tracks",
        paragraphs: [
          "Klicke auf einen oder mehrere Keys, um darunter diese Tracks aufzulisten. Frag nach den Keys, die zu 8A passen, und das Rad lässt sie leuchten. Öffne die Auswahl in der Library oder speichere sie als Smart Collection, mit den Playlists, die du angehakt hattest.",
        ],
      },
      {
        heading: "Nur Keys, denen CuePoint traut",
        paragraphs: [
          "Die Zählung nimmt deinen eigenen Key für einen Track oder sonst den Key seines übernommenen Beatport-Treffers. Tracks ohne beides werden in einer eigenen Zeile gezählt, „No Beatport key“, damit du siehst, wie viel von der Playlist noch abgeglichen werden muss.",
        ],
      },
    ],
    shot: "keys",
    doesNot: [
      "Es verändert weder deine Playlists noch deine Dateien.",
      "Es zählt die Keys von Rekordbox nicht. Ein Track ohne Beatport-Key und ohne Key von dir wird als ohne Key geführt.",
      "Es berechnet keinen Key aus dem Audio.",
    ],
    guide: { page: "keys", label: "Die Anleitung zu Keys lesen" },
    related: ["library", "statistics"],
    fromDecisions: ["DEC-200", "DEC-201", "DEC-206"],
  },
  {
    slug: "discover",
    name: "Discover",
    query: "neue Musik von Artists und Labels auf Beatport finden",
    title: "Neue Musik von deinen Artists und Labels finden | CuePoint",
    description:
      "Discover sucht auf Beatport neue Tracks von den Artists und Labels in deiner Bibliothek, blendet aus, was du schon hast, und führt eine Wantlist. Kostenlos.",
    heading: "Finde neue Musik von den Artists und Labels, die du spielst",
    summary: "Neue Musik von Beatport für die Artists und Labels, die schon in deiner Bibliothek sind.",
    problem: [
      "Du spielst seit Jahren dieselben Labels. Wenn du verfolgen willst, was sie und deine Lieblings-Artists veröffentlichen, heißt das, Beatport Seite für Seite abzuklappern.",
    ],
    how: [
      {
        heading: "Suchläufe, die Beatport für dich lesen",
        paragraphs: [
          "Starte einen Suchlauf und sag, wonach er suchen soll: Beatport-Charts in den Genres, die du wählst, von Artists aus deiner Bibliothek, und neue Releases auf deinen Labels aus den letzten Tagen. Jeden Artist und jedes Label deiner Bibliothek, nur die, die du auswählst, oder keine.",
          "Ein Suchlauf arbeitet im Hintergrund, während du CuePoint weiter benutzt, und jeder Suchlauf bleibt erhalten, bis du ihn löschst, sodass du den vom letzten Monat öffnen kannst.",
        ],
      },
      {
        heading: "Ohne das, was du schon hast",
        paragraphs: [
          "Tracks, die deine Bibliothek schon hat, werden ausgeblendet, mit einer Zahl, wie viele es sind. Ein Track gilt als vorhanden, wenn einer in deiner Bibliothek in Clean einen übernommenen Treffer dazu hat.",
        ],
      },
      {
        heading: "Eine Wantlist, eine Beatport-Playlist und ähnliche Tracks",
        paragraphs: [
          "Setze, was du haben willst, auf die Wantlist in CuePoint, oder schicke es in eine Playlist in deinem Beatport-Konto. Von jedem Track aus kannst du die Seite seines Artists oder Labels öffnen und Tracks in deiner eigenen Bibliothek finden, die einem ähneln, der dir gefällt.",
        ],
      },
    ],
    shot: "discover",
    doesNot: [
      "Es kauft, lädt oder spielt keine Beatport-Tracks. Sie haben keine Datei in deiner Bibliothek und lassen sich deshalb in CuePoint nicht abspielen.",
      "Es braucht ein Beatport-Token. Beatport verteilt Tokens nicht über deine Kontoseite. Du fragst Beatport zuerst nach API-Zugang, und die Anleitung führt dich durch die Schritte.",
      "Es weiß erst, dass ein Track dir gehört, wenn du ihn in Clean abgleichst. Bis dahin zeigt Discover ihn als neu.",
    ],
    guide: { page: "discover", label: "Die Anleitung zu Discover lesen" },
    related: ["clean", "prepare"],
  },
  {
    slug: "prepare",
    name: "Prepare",
    query: "ein DJ-Set vor dem Gig planen",
    title: "Ein DJ-Set vor dem Gig planen | CuePoint",
    description:
      "Lege ein Set als Ablauf in Kapiteln mit geplanten Zeiten an. CuePoint prüft jeden Übergang, schlägt Tracks für eine Lücke vor und erstellt eine Setlist.",
    heading: "Plane dein Set, bevor du am DJ-Pult stehst",
    summary: "Ein Set in Kapiteln bauen, mit Zeiten, Übergangs-Checks und einer Setlist.",
    problem: [
      "Du planst ein Set im Kopf oder auf einem Zettel und merkst erst beim Gig, dass zwei Tracks im Key kollidieren oder dass das Warm-up zwanzig Minuten zu lang läuft.",
    ],
    how: [
      {
        heading: "Ein Ablauf in Kapiteln",
        paragraphs: [
          "Ein Set ist ein Ablauf. Starte ein leeres oder kopiere eine Collection, eine Rekordbox-Playlist oder deine Auswahl hinein. Teile es in Kapitel wie Warm-up, Peak und Close ein und gib einem Kapitel eine Ziellänge und einen BPM-Bereich.",
          "Jeder Eintrag kann eine geplante Start- und Endzeit tragen, damit das Set zusammenrechnet, wie lange es läuft. Es zählt nur die Einträge, die du mit Zeiten versehen hast, und sagt, wie viele es nicht gezählt hat.",
        ],
      },
      {
        heading: "Checks, die sich selbst erklären",
        paragraphs: [
          "CuePoint prüft jeden Übergang und sagt, was es findet: einen Tempo-Sprung außerhalb des Fensters, das passt (halbes und doppeltes Tempo zählen als passend), einen Key-Clash ohne Verwandtschaft auf dem Camelot-Rad oder einen Track ohne BPM zum Vergleichen. Es markiert auch eine fehlende Datei und ein Kapitel, das über oder unter seiner Ziellänge liegt.",
          "Eine Warnung hält dich nie auf. Bestätige eine, die du gehört hast und von der du weißt, dass sie funktioniert.",
        ],
      },
      {
        heading: "Vorschläge und eine Setlist",
        paragraphs: [
          "Wähle eine Lücke, und CuePoint schlägt Tracks vor, die zwischen die beiden darum herum passen. Spiele das Set als Warteschlange ab, speichere dann eine Setlist als Text, CSV oder M3U8 oder exportiere das Set als eine Playlist nach Rekordbox.",
        ],
      },
    ],
    shot: "prepare",
    doesNot: [
      "Es mixt nicht. Beim Abspielen eines Sets laufen ganze Tracks nacheinander. Die geplanten Zeiten sind dein Plan, und zu ihnen startet, stoppt oder überblendet nichts.",
      "Es schreibt keine Kapitel, Zeiten oder Notizen nach Rekordbox. Rekordbox hat keinen Platz dafür, deshalb ist ein Export eine gewöhnliche Playlist in deinem Ablauf.",
      "Ein Set fasst bis zu 1.000 Einträge.",
    ],
    guide: { page: "prepare", label: "Die Anleitung zu Prepare lesen" },
    related: ["library", "waveforms"],
  },
  {
    slug: "statistics",
    name: "Statistics",
    query: "meistgespielte Tracks in Rekordbox",
    title: "Meistgespielte und nie gespielte Tracks | CuePoint",
    description:
      "Sieh meistgespielte Tracks, Top-Artists und -Labels, nie gespielte Tracks und wie sich deine Bibliothek auf Genre, Key und BPM verteilt. Kostenlos.",
    heading: "Sieh, was deine Rekordbox-Bibliothek wirklich enthält",
    summary: "Meistgespielt, nie gespielt und wie sich die Bibliothek verteilt.",
    problem: [
      "Welche Tracks spielst du wirklich? Welche liegen seit drei Jahren in der Bibliothek, ohne dass sie ein einziges Mal gelaufen sind? Rekordbox führt die Zahlen und rechnet sie dir nicht zusammen.",
    ],
    how: [
      {
        heading: "Was du spielst",
        paragraphs: [
          "Statistics listet deine meistgespielten Tracks als Top 10, 25, 50, 100 oder 200, deine Top-Artists und -Labels nach den Plays ihrer Tracks und die Tracks, die du noch nie gespielt hast. Die Play-Zähler sind die, die Rekordbox führt.",
          "CuePoint merkt sich außerdem die Zähler, die es bei jedem Import und jeder Aktualisierung liest, und kann so zeigen, was du seit einem Datum gespielt hast. Dieser Verlauf beginnt beim letzten Import, bevor CuePoint anfing, Zähler zu führen, und nichts davor lässt sich wiederherstellen.",
        ],
      },
      {
        heading: "Wie die Bibliothek aussieht",
        paragraphs: [
          "Sieh, wie sich deine Tracks auf Genre, Key, BPM, Jahr, Datum des Hinzufügens, Bewertung und Lautheit verteilen. Die Key-Übersicht zählt die Keys, denen CuePoint traut, und die Tracks, die noch keinen haben, und öffnet die Seite Keys mit denselben Playlists. Ein Bereich Health zählt fehlende Dateien, mit Beatport abgeglichene Tracks und Tracks mit analysierten Waveforms.",
          "Jede Zahl führt irgendwohin: Ein Balken oder eine Zeile öffnet die Library genau mit diesen Tracks.",
        ],
      },
    ],
    shot: "statistics",
    doesNot: [
      "Es zählt keine Plays im eigenen Player von CuePoint. Die Plays sind die von Rekordbox.",
      "Es schlägt nichts nach. Jede Zahl stammt aus dem, was deine Bibliothek schon enthält.",
      "Es kann keine Plays von vor dem Beginn des Verlaufs zeigen.",
    ],
    guide: { page: "statistics", label: "Die Anleitung zu Statistics lesen" },
    related: ["keys", "clean"],
    fromDecisions: ["DEC-136", "DEC-137", "DEC-138", "DEC-168", "DEC-206"],
  },
  {
    slug: "waveforms",
    name: "Waveforms and the player",
    query: "Waveform und Lautheit meiner DJ-Tracks",
    title: "Waveforms und Lautheit für deine DJ-Tracks | CuePoint",
    description:
      "CuePoint zeichnet für jeden gefundenen Track eine Waveform mit deinen Rekordbox-Cues und dem Beatgrid, misst die Lautheit und spielt lückenlos ab. Kostenlos.",
    heading: "Sieh Form und Lautheit jedes Tracks, bevor du ihn spielst",
    summary: "Eine Waveform und ein Lautheitswert für jeden Track, und ein Player zum Ausprobieren.",
    problem: [
      "Du willst sehen, wo der Breakdown liegt und wie lang das Intro läuft, ohne den Track abzuspielen. Und du willst wissen, ob der nächste lauter klingt, wenn du ihn einblendest.",
    ],
    how: [
      {
        heading: "Eine Waveform für jeden Track",
        paragraphs: [
          "CuePoint berechnet für jeden Track, dessen Datei es findet, eine Waveform aus dem Audio selbst, im Hintergrund und mit niedriger Priorität. Es zeichnet sie in der Player-Leiste (ein Klick springt dorthin), in den Track details, als Spalte der Library und im Übergangsstreifen von Prepare. Wähle drei farbige Bänder für Tiefen, Mitten und Höhen oder eine Farbe.",
          "Deine Rekordbox-Hot-Cues, Memory-Cues, Loops und das Beatgrid sind darauf eingezeichnet.",
        ],
      },
      {
        heading: "Lautheit in LUFS",
        paragraphs: [
          "Derselbe Durchlauf misst, wie laut jeder Track über die gesamte Länge ist, und seine höchste Spitze. Im Übergangsstreifen von Prepare steht zwischen zwei Tracks in Worten, um wie viel lauter oder leiser der nächste ist.",
        ],
      },
      {
        heading: "Ein Player, der tut, was du verlangst",
        paragraphs: [
          "Doppelklicke einen Track, und die Ansicht, die du gerade betrachtest, wird zur Warteschlange. Die Wiedergabe ist lückenlos und läuft über das Audiogerät, das du wählst. Nichts spielt, bis du es verlangst.",
        ],
      },
    ],
    shot: "waveforms",
    doesNot: [
      "Es regelt einen Track nicht wegen seiner Lautheit hoch oder runter und schreibt den Wert weder in deine Dateien noch nach Rekordbox.",
      "Es bearbeitet keine Cues oder Beatgrids. Die gehören Rekordbox: Verschiebe sie dort und aktualisiere.",
      "Es zoomt und scrollt nicht. Eine Waveform ist der ganze Track auf einmal.",
      "Eine erste Analyse einer großen Bibliothek dauert Stunden: etwa 6.000 Tracks von sechs Minuten pro Stunde auf einem aktuellen Desktop. Sie lässt sich pausieren und läuft nach einem Neustart weiter.",
      "Der Linux-Build kommt ohne den Player.",
    ],
    guide: { page: "waveforms", label: "Die Anleitung zu Waveforms lesen" },
    related: ["prepare", "library"],
  },
  {
    slug: "export",
    name: "Export to Rekordbox",
    query: "bearbeitete Keys zurück nach Rekordbox-XML exportieren",
    title: "Änderungen zurück nach Rekordbox exportieren | CuePoint",
    description:
      "Schreibe Keys, BPM, Genres, Labels und Playlists in eine neue Rekordbox-XML-Datei. Cue-Punkte und Beatgrids bleiben erhalten, das Original bleibt unberührt.",
    heading: "Schicke deine Korrekturen sicher zurück zu Rekordbox",
    summary: "Eine neue Rekordbox-XML-Datei mit deinen Werten, mit erhaltenen Cues und Beatgrids.",
    problem: [
      "Du hast Hunderte Keys korrigiert und Collections gebaut. Sie nützen nur etwas, wenn sie zurück nach Rekordbox kommen, ohne die Cue-Punkte zu verlieren, die du über Jahre gesetzt hast.",
    ],
    how: [
      {
        heading: "Eine angepasste Kopie, kein Neuaufbau",
        paragraphs: [
          "Export nimmt die XML-Datei, die du importiert hast, kopiert sie und ändert nur die Werte, die du in CuePoint geändert hast. Hot Cues, Memory-Cues, Beatgrids und alles andere, was Rekordbox geschrieben hat, werden genau so übernommen, wie sie waren.",
        ],
      },
      {
        heading: "Vorschau lesen, dann exportieren",
        paragraphs: [
          "Eine Vorschau sagt, was geschrieben wird, bevor irgendetwas geschrieben wird: wohin die Datei geht, wie viele Tracks deine Werte bekommen, Feld für Feld, und jede Playlist. Sie sagt dir auch, ob sich die Datei, die du importiert hast, seitdem geändert hat. Der Button sagt, was er tun wird, zum Beispiel „Export 3,880 tracks and 4 playlists“.",
          "Der Export schreibt deinen Key, BPM, Genre, Label, Jahr und deine Bewertung, und die Collections, die du anhakst, als Playlists in einen Ordner namens CuePoint. Ein Set, das du anhakst, wird eine Playlist in seiner Reihenfolge, unter seinem eigenen Ordnerpfad.",
        ],
      },
      {
        heading: "In Rekordbox öffnen",
        paragraphs: [
          "Rekordbox zeigt die exportierte Datei als zweite Bibliothek, „rekordbox xml“, neben deiner eigenen. Verweise in den Einstellungen von Rekordbox auf die Datei und ziehe die Playlists oder Tracks, die du willst, in deine Sammlung. Du kannst Keys schreiben, wie Rekordbox es tut, oder als Camelot (8A).",
        ],
      },
    ],
    shot: "export",
    doesNot: [
      "Es überschreibt nie die Datei, die du importiert hast, und lehnt sie als Ziel ab. Der Export ist immer eine neue Datei, die du wählst.",
      "Es schreibt nicht in die Datenbank von Rekordbox.",
      "Es exportiert keine Tags, Notizen oder Favoriten. Die XML von Rekordbox hat keinen Platz dafür.",
      "Es packt deine Audiodateien nicht in den Export. Um Werte in die Dateien selbst zu schreiben, nimmst du nach einer Vorschau „Write tags to files“.",
    ],
    guide: { page: "rekordbox-export", label: "Die Anleitung zum Export lesen" },
    related: ["clean", "library"],
  },
];
