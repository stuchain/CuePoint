## CuePoint coding standards

- **Formatting**: Python formatted with `black` (line length 100) and imports sorted with `isort` (`profile = "black"`).
- **Linting**: Keep code clean and readable; run `pylint` and `flake8` locally when changing core modules.
- **Typing**: Prefer type hints for public APIs; keep types pragmatic (avoid over-annotation).
- **Security**: Do not log secrets/tokens. Validate and sanitize untrusted input (files, URLs, external data).
- **Testing**: New/changed logic must have unit tests; regressions should get a test before the fix.
- **Errors**: Raise domain exceptions (e.g. `ExportError`, `ConfigurationError`) with an `error_code` and useful context.

