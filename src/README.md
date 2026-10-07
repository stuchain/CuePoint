# Source

- `main.py`: CLI entry point
- `cuepoint/`: Python application package
- `tests/`: Python test suite

The application package is organized by responsibility:

- `cli/`: command-line orchestration
- `compat/`: shared types the services import (`gui_types.py`)
- `core/`: matching, text-processing, set-analysis and waveform logic
- `data/`: Rekordbox, Beatport, audio and tag-file access
- `engine/`: HTTP API and background jobs used by the Electron app
- `exceptions/`: the domain exceptions
- `migrations/`: database migrations, discovered at run time
- `models/`: domain and configuration models
- `persistence/`: SQLite repositories and stores
- `services/`: application services
- `utils/`: shared infrastructure
