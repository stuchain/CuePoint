# Translating the website (DEC-311)

The site is in English, German (`de`), Spanish (`es`) and Brazilian Portuguese (`pt-br`). English is the
source: it lives at the site root and every translated page says `x-default` is the English one. This page is
the whole brief for a translator, human or Claude, and for the weekly blog routine.

## What is translated

The home page, Features (the index and each feature), Compare (the index and each comparison), Download and
the FAQ, plus the shared frame (header, footer, breadcrumbs, labels). Not translated: the guide, the blog,
the legal pages, the contact form, the changelog and the style guide. A link to one of them from a translated
page says it leaves the language.

The app is in English. Each translated page carries one note that says so, so the area and button names on
the page are the ones the reader will see in the app.

## Words that stay English

Keep these exactly as written, in every language. A test (`src/i18n/parity.test.ts`, `LOCKED_WORDS`) fails
when a string that has one in English loses it in the translation.

- Product: CuePoint, Rekordbox, Beatport, Camelot, GitHub, Open Source.
- The areas: Clean, Library, Keys, Discover, Prepare, Statistics, Waveforms.
- Buttons and states as the app shows them: Save to files, Rekordbox file, Mark OK, Correct, Undo, Smart Collection,
  Track details.
- DJ and file terms: BPM, Hot Cue, Beatgrid, Playlist, key, energy, AppImage, XML, M3U8, CSV, SHA-256.

Rules that follow from this:

- Write a locked word as one word, with the translation's grammar around it: "Prepare öffnen", "im Übergangsstreifen
  von Prepare". Do not translate it, and do not inflect it. A hyphen compound is fine ("Library-Verwaltung").
- A word the app does not show (a general noun such as "library" meaning a collection, "match", "tab") is
  translated normally. When unsure, look at the English page: a capitalized product term is locked.
- A quoted message from the app ("No Beatport key") stays as the app shows it, in English, in quotation marks of
  the language („…“ in German, «…» or “…” in Spanish, “…” in Portuguese).
- Names of other tools (Lexicon, Mixed In Key, OpenKeyScan) and their facts stay as in English; their source
  line (`data-compare-source`) keeps its date and link.
- Numbers, versions, file names, key codes (8A), URLs and ids are never translated. Dates and number formats
  follow the language (the code does this).
- No email address anywhere (DEC-230). A test fails on one.

## Tone

Informal, direct, the way a DJ talks to another DJ, and the same short sentences as the English. Plain words,
no marketing gloss, no exclamation marks that the English does not have.

| Language | Address | Example |
| --- | --- | --- |
| German | du, never Sie (dein, dir, dich) | "Importiere deine Sammlung." |
| Spanish | tú, never usted (tu, te) | "Importa tu colección." |
| Brazilian Portuguese | você (seu, sua), not tu | "Importe sua coleção." |

Use the word DJs of that language use for the thing ("Sammlung", "colección", "coleção" for the collection
you export from Rekordbox); keep Anglicisms that DJs already say (Track, Playlist, Set, Cue).

## Files to add for a language

For a language with code `xx` (the folder, lower case, `pt-br`):

1. `src/i18n/ui/xx.ts`: the frame's strings. Copy `src/i18n/ui/en.ts`; the type `UiStrings` makes a missing or
   extra key a type error. Keep every `{placeholder}`, every `**bold**` and every `[label](linkKey)`.
2. `src/data/i18n/xx/home.ts`, `features.ts`, `compare.ts`: the page content. Same exports and the same
   shape as `src/data/home.ts`, `features.ts`, `compare.ts`. Ids, slugs, screenshot keys, paths and other
   non-text fields stay as they are in English.
3. `src/content/faq.xx.yaml`: the FAQ, the same questions in the same order as `faq.yaml`.
4. An entry in `src/i18n/sources.json` (written by `npm run i18n:stale -- --record xx`, see below).
5. One entry in `src/i18n/locales.ts`: `{ code, hreflang, ogLocale, name, short }`, for example
   `{ code: "es", hreflang: "es", ogLocale: "es_ES", name: "Español", short: "ES" }`. `name` is the language in
   itself. `hreflang` is the BCP 47 tag (`pt-BR` for `pt-br`).

Nothing else changes: the routes, the header switch, the sitemap, hreflang, Open Graph cards and every test
pick the new language up from `locales.ts` and the files above.

Limits that the tests enforce: a page title is at most 60 characters and a description is 70 to 160 (the
same as English), so a long translation has to be shortened, not cut off. Headings hyphenate on their own.

## Commands

Run in `apps/website`:

```
npx vitest run src/i18n          # structure, placeholders, untranslated strings, locked words, limits
npm run check                    # types
npm run build                    # builds /xx/... for every translated page
npm run check:site               # lang-attr, hreflang and translation-missing rules
npm run i18n:stale               # which translations are behind the English
npm run i18n:stale -- --strict   # the same, exit 1 if any
npm run i18n:stale -- --record xx   # after refreshing language xx: write today's English hashes for it
```

A string that is the same as its English source fails the "untranslated" test unless it is a name or code a
reader sees the same in every language; add those to `SAME_ON_PURPOSE` in `parity.test.ts` with a reason.

## Check your own work: the back-translation

Do this on every string before you finish. It is how drift is found.

1. Read the translated string without looking at the English, and write what it says in English.
2. Compare that to the English source. The meaning, the numbers, every condition ("only", "never", "if") and
   every claim must be the same. Nothing may be added, left out or made stronger.
3. Check the product words are the locked ones, the address form is right, and a DJ would say it that way
   aloud. Fix any string that reads like a translation.
4. Re-run `npx vitest run src/i18n`.

## Stale translations

`src/i18n/sources.json` holds, per language, the sha256 of each English source file as it was when the
translation was last made or confirmed. `npm run i18n:stale` hashes the English files now and lists each
language and file that differs:

- `stale`: the English changed. Read the diff of the English file (`git log -p -- src/data/features.ts`),
  carry every change into the translation, back-translate the changed strings, then `--record`.
- `unrecorded`: the language has no hash for the file yet.
- `no-translation`: the translation file is missing.

Stale never fails the build; a stale page is still correct enough to publish and is fixed on the next pass.
`--strict` is for a person or a job that wants the list to be empty.

## The weekly blog routine

The blog is English only, so a new post needs no translation. The routine still must:

1. After it changes an English file that is a source (`src/data/home.ts`, `features.ts`, `compare.ts`,
   `src/content/faq.yaml`, `src/i18n/ui/en.ts`), run `npm run i18n:stale`.
2. For each language it lists, update the translation file with the words above, back-translate what it
   changed, run `npx vitest run src/i18n` and `npm run build`, then `npm run i18n:stale -- --record <code>`.
3. If it cannot translate a language well, leave the language as it is and say which pairs are stale in its
   summary. Never machine-translate a string without the back-translation, and never edit the English to
   make a translation fit.
4. A new feature or comparison page needs its entry in every language before it ships: `check:site` fails with
   `translation-missing` otherwise.
