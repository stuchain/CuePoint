# Old Module Files

This directory contains old module files that have been migrated to the new package structure.

## Migration Status

These files are **deprecated** and kept only for reference. The actual working code is in the new package structure:

- `beatport.py` → `cuepoint/data/beatport.py`
- `beatport_search.py` → `cuepoint/data/beatport_search.py`
- `matcher.py` → `cuepoint/core/matcher.py`
- `query_generator.py` → `cuepoint/core/query_generator.py`
- `text_processing.py` → `cuepoint/core/text_processing.py`
- `mix_parser.py` → `cuepoint/core/mix_parser.py`
- `rekordbox.py` → `cuepoint/data/rekordbox.py`
- `config.py` → `cuepoint/models/config.py` + `cuepoint/services/config_service.py`
- `output_writer.py` → `cuepoint/services/output_writer.py`
- `utils.py` → `cuepoint/utils/utils.py`
- `performance.py` → `cuepoint/utils/performance.py`
- `error_handling.py` → `cuepoint/utils/error_handler.py`
- `gui_interface.py` → `cuepoint/ui/gui_interface.py`

## Note

These files should **not** be imported or used. They are kept for historical reference only.

