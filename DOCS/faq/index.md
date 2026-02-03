# Frequently Asked Questions

Design 10.26. Common questions and where to find answers.

## User Questions

### What is CuePoint?

CuePoint enriches Rekordbox XML playlists with Beatport metadata (BPM, key, artists, etc.). See [Quick Start](../getting-started/quick-start.md).

### How do I get started?

1. Export your Rekordbox collection as XML
2. Import the XML in CuePoint
3. Process to fetch Beatport metadata
4. Review and export results

See [First Steps](../getting-started/first-steps.md) and [Workflows](../user-guide/workflows.md).

### What do match scores mean?

Scores above 80% are usually reliable. See [Glossary](../user-guide/glossary.md) for terms like *candidate*, *confidence*, and *low-confidence*.

### Something went wrong. Where do I look?

See [Troubleshooting](../user-guide/troubleshooting.md) for common errors and fixes.

### What formats can I export?

CSV, JSON, and Excel. See [Features](../user-guide/features.md).

## Developer Questions

### How do I run tests?

```bash
python scripts/run_tests.py --unit
python scripts/run_tests.py --all
```

See [Testing Strategy](../DEVELOPMENT/testing-strategy.md).

### How do I add new match rules?

See [Match Rules & Scoring](../DEVELOPMENT/match-rules-and-scoring.md).

### How do I update Beatport parsing?

See [Beatport Parsing](../DEVELOPMENT/beatport-parsing.md).

### Where do I start contributing?

See [Contributing](../../.github/CONTRIBUTING.md) and [Developer Setup](../DEVELOPMENT/developer-setup.md).

---

*Last updated: 2026-02-03*
