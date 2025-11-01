# CuePoint - Rekordbox → Beatport Metadata Enricher

This project has been refactored from a single large script (`example.py`) into a structured modular architecture for better maintainability.

## Project Structure

- `config.py` - Configuration settings and constants
- `utils.py` - Utility functions (logging, timestamps)
- `text_processing.py` - Text normalization and similarity scoring
- `mix_parser.py` - Mix/remix phrase extraction and parsing
- `rekordbox.py` - Rekordbox XML parsing
- `beatport.py` - Beatport scraping and parsing (to be created)
- `query_generator.py` - Search query generation (to be created)
- `matcher.py` - Matching and scoring logic (to be created)
- `processor.py` - Track processing orchestration (to be created)
- `main.py` - CLI entry point (to be created)

## Usage

The original `example.py` remains functional. The modular version will be completed incrementally.

## Status

✅ **All modules created!** The project has been successfully split into a structured modular architecture:

- ✅ `config.py` - Configuration settings and constants
- ✅ `utils.py` - Logging and timestamp utilities
- ✅ `text_processing.py` - Text normalization and similarity scoring
- ✅ `mix_parser.py` - Mix/remix phrase extraction and parsing
- ✅ `rekordbox.py` - Rekordbox XML parsing
- ✅ `beatport.py` - Beatport scraping and parsing
- ✅ `query_generator.py` - Search query generation
- ✅ `matcher.py` - Matching and scoring logic
- ✅ `processor.py` - Track processing orchestration
- ✅ `main.py` - CLI entry point
- ✅ `__init__.py` - Package initialization

## Usage

Run the modular version with:
```bash
python main.py --xml collection.xml --playlist "Your Playlist Name" --out output.csv
```

**Note:** All CSV output files will be created in the `output/` directory. The directory will be created automatically if it doesn't exist.

## Legacy Files

The original `example.py` script has been moved to the `LEGACY/` folder for reference. The new structured version is the primary implementation.

