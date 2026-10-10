# Content plan: the search each page answers (SITE-08)

Each feature page is written for one query a DJ types, and no two pages aim at the same query.
`src/content/features.test.ts` reads the table below: every feature page must have a row whose query
matches the page's `query` in `src/data/features.ts`, and no query may appear twice.

| Query | Page | Notes |
| --- | --- | --- |
| "fix Rekordbox key tags" | `features/clean/` | Matching to Beatport, applying key, tempo, genre, label and year. |
| "filter Rekordbox tracks by key and BPM" | `features/library/` | Search, filters, columns, and the header's Camelot wheel (shipped with PAGES-10). "Camelot wheel harmonic mixing Rekordbox" is a second query the Library page could take on. |
| "keys in my Rekordbox playlist" | `features/keys/` | The Keys page. |
| "find new music from artists and labels on Beatport" | `features/discover/` | Discover runs, wantlist. |
| "plan a DJ set before the gig" | `features/prepare/` | Sets, chapters, times, checks, set lists. |
| "most played tracks in Rekordbox" | `features/statistics/` | Plays, never played, spreads. |
| "waveform and loudness of my DJ tracks" | `features/waveforms/` | Waveforms, loudness and the player. |
| "export edited keys back to Rekordbox XML" | `features/export/` | The export and how Rekordbox opens it. |

## Comparison pages (DEC-197)

These answer "X alternative" and "X vs CuePoint" searches. Every fact about another tool links its own
public page and carries the date it was checked (`src/data/compare.ts`).

| Query | Page | Notes |
| --- | --- | --- |
| "Lexicon DJ alternative for Rekordbox" | `compare/lexicon/` | |
| "Mixed In Key alternative" | `compare/mixed-in-key/` | |
| "OpenKeyScan alternative" | `compare/openkeyscan/` | rekordcloud's free key detector. |

## Answered inside a page, with no page of its own

- "find duplicate tracks Rekordbox": answered in the second half of the Clean page ("Duplicates and
  missing files"). No page aims its title at it, so it does not compete with "fix Rekordbox key tags".
