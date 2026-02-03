# Testing Strategy

Design 10.8, 10.121. What tests to add and when.

## Test Pyramid

```
        ┌─────────┐
        │ System  │  Few, slow, full stack
        ├─────────┤
        │Integrat.│  More, mocked I/O
        ├─────────┤
        │  Unit   │  Many, fast, isolated
        └─────────┘
```

## Test Layers

| Layer | Location | Purpose |
| --- | --- | --- |
| Unit | `SRC/tests/unit/` | Fast, isolated, mock external deps |
| Integration | `SRC/tests/integration/` | Real modules, mocked network/disk |
| System | `SRC/tests/system/` | CLI smoke, end-to-end |
| Regression | `SRC/tests/regression/` | Previously reported bugs |

## When to Add Tests

| Change Type | Add |
| --- | --- |
| New feature | Unit + integration |
| Bug fix | Regression test first, then fix |
| Config change | Unit test for new behavior |
| Refactor | Ensure existing tests still pass |
| New module | Unit tests for public API |

## Running Tests

```bash
# Unit only (fast)
python scripts/run_tests.py --unit

# Unit + integration
python scripts/run_tests.py

# All layers (including system)
python scripts/run_tests.py --all

# Exclude slow tests
python scripts/run_tests.py --unit --no-slow

# Specific module
pytest SRC/tests/unit/core/test_matcher.py -v
```

## Markers

| Marker | Purpose |
| --- | --- |
| `unit` | Unit tests |
| `integration` | Integration tests |
| `system` | System/CLI tests |
| `slow` | Long-running (excluded with `--no-slow`) |
| `ui` | GUI tests |

## Coverage Targets

- **Unit**: 85%+ for core modules
- **Integration**: 70%+ for services

## Adding a Unit Test

1. Create or extend `SRC/tests/unit/<module>/test_<name>.py`
2. Use pytest fixtures for setup
3. Mock external calls (`patch`, `MagicMock`)
4. Assert behavior, not implementation

## Adding an Integration Test

1. Create or extend `SRC/tests/integration/test_<name>.py`
2. Use real modules; mock only network/filesystem
3. Use fixtures from `SRC/tests/fixtures/`

## Fixtures

- `SRC/tests/fixtures/rekordbox/`: Sample XML files
- `SRC/tests/fixtures/beatport/`: Sample HTML responses

See [Fixtures README](https://github.com/stuchain/CuePoint/blob/main/SRC/tests/fixtures/README.md).

## Related

- [Dev Sandbox](dev-sandbox.md)
- [Debug a Mismatch](debug-mismatch.md)
