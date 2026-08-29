# Source

- `main.py`: CLI entry point
- `gui_app.py`: local Electron launcher
- `cuepoint/`: Python application package
- `tests/`: Python test suite

The application package is organized by responsibility:

- `cli/`: command-line orchestration
- `core/`: matching and text-processing logic
- `data/`: Rekordbox and Beatport access
- `engine/`: HTTP API used by the Electron app
- `incrate/`: inventory and discovery workflows
- `models/`: domain and configuration models
- `services/`: application services
- `utils/`: shared infrastructure
