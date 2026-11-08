# Translating the website (DEC-312)

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

Keep these exactly as written, in every language. The list the tests hold you to is `LOCKED_WORDS` in
`src/i18n/locked.ts`: read it there, it is the only copy. A test (`src/i18n/parity.test.ts`) fails when a string
that has one of them in English loses it in the translation. It checks the UI strings, the home page (steps,
features, the trust claims, the screenshot descriptions), the feature and comparison pages (the source labels
included) and the FAQ (the link labels included).

- Product and file names: CuePoint, Rekordbox, Beatport, Camelot, GitHub, AppImage, XML, M3U8, CSV, SHA-256, BPM.
- The areas: Clean, Library, Keys, Discover, Prepare, Statistics, Waveforms. These are matched with their capital:
  the general noun "library" (a collection of tracks) is translated.
- The app's views and buttons as the page says them: Smart Collection, Track details. The app's other button names
  (Save to files, Mark OK, Undo, ...) are locked as well the day an English page says one: add it to `LOCKED_WORDS`
  first, then translate around it.
- DJ words DJs use in English: playlist, hot cue, beat grid. These are matched in any case and as a plural, with or
  without the space ("Hot Cues", "Beatgrid"), and each language should use one form.

A word the list does not have is yours to translate. `LOCKED_WORDS` holds only words the English pages use now (a
test fails on a dead entry), so the doc's categories can run ahead of the list.

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

1. `src/i18n/ui/xx.ts`: the frame's strings, the cookie notice (`consent`), the labels and the download page's words.
   Copy `src/i18n/ui/en.ts`; the type `UiStrings` makes a missing or extra key a type error. Keep every
   `{placeholder}`, every `**bold**` and every `[label](linkKey)`. Notes on keys that are not plain text:
   - `downloadedTimes` has `one` and `other`; add the other CLDR forms (`zero`, `two`, `few`, `many`) your language's
     plural rule needs. The page picks the form with `Intl.PluralRules`, and a form you leave out falls back to `other`.
   - `downloadFor` is the whole spoken name of each file's button, one sentence with `{title}` in the word order of
     your language ("CuePoint für {title} herunterladen"). The visible button says `downloadButton`.
   - `primaryActionShort` is what the header says before the first release, where the bar is tight. Keep it short
     (English "Get notified" has 12 letters, and nothing wider than the longest nav link is safe). The header bar
     must stay one row 58px tall from 1000 to 1280px: `e2e/i18n.spec.ts` checks it for every language, with and
     without a release, so a long `downloadLabel` or `primaryActionShort` fails it.
   - `inEnglish` is said in brackets after a link to the guide, which has no translation ("(auf Englisch)").
2. `src/data/i18n/xx/home.ts`, `features.ts`, `compare.ts`: the page content. Same exports and the same
   shape as `src/data/home.ts`, `features.ts`, `compare.ts`. Ids, slugs, screenshot keys, paths and other
   non-text fields stay as they are in English.
3. `src/content/faq.xx.yaml`: the FAQ, the same questions in the same order as `faq.yaml`.
4. An entry in `src/i18n/sources.json` (written by `npm run i18n:stale -- --record xx --all`, see below).
5. One entry in `src/i18n/locales.ts`: `{ code, hreflang, ogLocale, name, short }`, for example
   `{ code: "es", hreflang: "es", ogLocale: "es_ES", name: "Español", short: "ES" }`. `name` is the language in
   itself. `hreflang` is the BCP 47 tag (`pt-BR` for `pt-br`).

Nothing else changes: the routes, the header switch, the sitemap, hreflang, Open Graph cards and every test
pick the new language up from `locales.ts` and the files above.

Limits that the tests enforce: a page title is at most 60 characters and a description is 70 to 160 (the
same as English), so a long translation has to be shortened, not cut off. Headings hyphenate on their own.

Fonts: the site loads the Latin subset of its two fonts (`astro.config.ts`), which covers German, Spanish and
Portuguese (Latin-1). A language that needs more letters (Polish, Czech, Turkish, Vietnamese, anything beyond
Latin-1) must also get the `latin-ext` files of `@fontsource/pixelify-sans` and
`@fontsource-variable/atkinson-hyperlegible-next` added to the `fonts` entries there, and a Greek or Cyrillic
language its own subsets; until it does, those letters fall back to a system font. A script the fonts do not have
needs a font choice from the owner.

## Commands

Run in `apps/website`:

```
npx vitest run src/i18n          # structure, placeholders, untranslated strings, locked words, limits
npm run check                    # types
npm run build                    # builds /xx/... for every translated page
npm run check:site               # lang-attr, hreflang and translation-missing rules
npm run i18n:stale               # which translations are behind the English
npm run i18n:stale -- --strict   # the same, exit 1 if any
npm run i18n:stale -- --record xx <source>…   # after refreshing language xx: record the named English files only
npm run i18n:stale -- --record xx --all       # a language that was just added: record every source
```

A string that is the same as its English source fails the "untranslated" test unless it is a name or code a
reader sees the same in every language. Those live in `SAME_ON_PURPOSE` in `src/i18n/locked.ts`, one list for each
language. A real English phrase ("The Library", "Export to Rekordbox") is never one of them: translate around its
locked word ("Library"). Nothing but a person who is changing the rules edits `SAME_ON_PURPOSE`, `LOCKED_WORDS` or
`NOT_TEXT_KEYS`; a failing test means the translation changes.

## Check your own work: the back-translation

Do this on every string before you finish. It is how drift is found.

1. Read the translated string without looking at the English, and write what it says in English.
2. Compare that to the English source. The meaning, the numbers, every condition ("only", "never", "if") and
   every claim must be the same. Nothing may be added, left out or made stronger.
3. Check the product words are the locked ones, the address form is right, and a DJ would say it that way
   aloud. Fix any string that reads like a translation.
4. Re-run `npx vitest run src/i18n`.

## Stale translations

`src/i18n/sources.json` holds, per language and per English source file, the sha256 of the file as it was when the
translation was last made or confirmed, the git commit the English was at, and the day. `npm run i18n:stale` hashes
the English files now and lists each language and file that differs:

- `stale`: the English changed. Read what changed with the command it prints, `git diff <recorded commit> -- <source>`
  (run from `apps/website`), carry every change into the translation, back-translate the changed strings, then
  record just that file.
- `unrecorded`: the language has no hash for the file yet.
- `no-translation`: the translation file is missing.

The English sources are `src/data/home.ts`, `features.ts`, `compare.ts`, `src/content/faq.yaml` and
`src/i18n/ui/en.ts`. Every English string a translated page shows is in one of them (the cookie notice and the
footer's link names are in `ui/en.ts`); a test holds the list in `scripts/i18n-stale.mjs` to the loaders, so a new
source cannot be forgotten.

`--record <language> <source>…` records only the files you name, prints what each one was (stale, unrecorded) and
what is still open for the language, and refuses a file whose English has uncommitted changes (commit the English
first: the recorded commit is what the next reader diffs from). It exits 2 for an unknown flag or language or a name
that is not an English source, and then writes nothing.

Stale never fails the build; a stale page is still correct enough to publish and is fixed on the next pass.
`--strict` is for a person or a job that wants the list to be empty.

An English edit that changes no visible word (a comment, a type, a reordered import) still marks the file stale.
Confirm with the diff that nothing a reader sees changed, then record it for each language: there is nothing to
translate.

## The weekly blog routine

The blog is English only, so a new post needs no translation. The routine still must:

1. Run `npm run i18n:stale` first, every week, whether or not it changed an English file: a person or another job
   may have. Everything below is about the pairs it lists.
2. For each language it lists, carry the English changes into the translation files with the words above, and
   back-translate what changed. Wording changes may wait for a later pass (step 5). Structural changes may not: a
   new feature, a new page, a new FAQ question, a new comparison row, a new download step or a new UI string must be
   translated in every language, or held back (not shipped) until it is. A half-translated structure fails the parity
   tests anyway.
3. Run the gate, in `apps/website`, in this order:

   ```
   npm run check && npm test && npm run build && npm run check:site
   ```

   It stops at the first failure. If the gate fails, stop and report which command failed and why: do not record,
   do not edit `SAME_ON_PURPOSE`, `LOCKED_WORDS` or `NOT_TEXT_KEYS` to make it pass, and do not edit the English to
   make a translation fit.
4. Only when the whole gate is green, record the files you carried over, for that language:
   `npm run i18n:stale -- --record <code> <source>…`. Do not record a file you did not finish.
5. If it cannot translate a language well, leave that language as it is and say which pairs are still stale in the
   summary. Never machine-translate a string without the back-translation.
6. A new feature or comparison page needs its entry in every language before it ships: `check:site` fails with
   `translation-missing` otherwise.
