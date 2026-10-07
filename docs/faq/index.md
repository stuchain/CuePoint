# Frequently Asked Questions

Common questions and where to find answers.

## User Questions

### What is CuePoint?

CuePoint keeps a library of your Rekordbox collection, matches it to Beatport metadata (key, BPM, genre, label, year), and helps you keep it clean. See [Getting Started](../user-guide/getting-started.md).

### How do I get started?

1. Export your Rekordbox collection as XML
2. Import it on the **Library** page
3. Match it on Beatport from the **Clean** page
4. Review the matches, apply the values you want, and export the review list

See [Getting Started](../user-guide/getting-started.md) and [Workflows](../user-guide/workflows.md).

### What do match scores mean?

CuePoint accepts a match on its own only when it scores 95 or more and passes every check; everything else with a candidate waits for your review. See [Clean](../user-guide/clean.md). See [Glossary](../user-guide/glossary.md) for terms like *candidate*, *confidence*, and *low-confidence*.

### Something went wrong. Where do I look?

See [Troubleshooting](../user-guide/troubleshooting.md) for common errors and fixes.

### Where did inKey and Results go?

They became **Clean** (DEC-071). Import your collection once in the Library, then match a playlist, a Collection or the whole library from Clean, and review there. Past searches' CSV files stay where they were saved; CuePoint no longer lists them. See [Where inKey and Results went](../user-guide/clean.md#where-inkey-and-results-went). The command-line tool is unchanged.

### Where did inCrate go?

It became **Discover** (DEC-090, DEC-100), and the **Tools** group it sat in is gone; the app opens on the Library when it has no page to reopen, and an old inCrate link opens Discover. Discover works on the collection you imported in the Library, so there is no second import, and it knows which tracks you own from Clean's matches. inCrate's inventory file and its past results stay on your computer, read by nothing; see [Where inCrate went](../user-guide/discover.md#where-incrate-went) for where they are and which settings you may delete.

### What does a Discover run do?

A run is a background job, shown in the status strip, that you can stop:

1. **Charts.** For each genre you chose, it lists Beatport's charts in the date range and keeps those made by an artist in your library — by Beatport id where CuePoint knows it, otherwise by name.
2. **New releases.** For each label in your library, it reads the label's tracks released in the last few days (30 unless you choose otherwise). A label is found on Beatport once and remembered, so a second run makes no label searches.
3. **Every reason, kept.** A track found in two charts and a release keeps all three reasons. The run is stored with its tracks, so you can reopen it after a relaunch.

Tracks you already own — ones with an accepted Beatport match in Clean — are hidden and counted. Nothing a run does changes your library or your files. See [Discover](../user-guide/discover.md).

### What formats can I export?

CSV, JSON, and Excel. See [Features](../user-guide/features.md).

## Developer Questions

### How do I run tests?

```bash
python scripts/run_tests.py --unit
python scripts/run_tests.py --all
cd apps/desktop-electron/renderer && npm test
```

See [Testing Strategy](../development/testing-strategy.md).

### How do I add new match rules?

See [Match Rules & Scoring](../development/match-rules-and-scoring.md).

### How do I update Beatport parsing?

See [Beatport Parsing](../development/beatport-parsing.md).

### Where do I start contributing?

See [Contributing](../../.github/CONTRIBUTING.md) and [Developer Setup](../development/developer-setup.md).
