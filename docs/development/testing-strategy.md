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
| Unit | `src/tests/unit/` | Fast, isolated, mock external deps |
| Integration | `src/tests/integration/` | Real modules, mocked network/disk |
| System | `src/tests/system/` | CLI smoke, end-to-end |
| Regression | `src/tests/regression/` | Previously reported bugs |
| Acceptance | `src/tests/acceptance/` | Install-level checks |
| Performance | `src/tests/performance/` | Scale tests and benchmarks against budgets |

The desktop app has three more suites, none of which `run_tests.py` runs:

| Suite | Location | Command |
| --- | --- | --- |
| Renderer components and logic | `apps/desktop-electron/renderer/src/**/*.test.ts(x)` | `npm test` in `apps/desktop-electron/renderer` (vitest, Testing Library) |
| Electron main process | `apps/desktop-electron/electron/*.test.ts` | `npm test` in `apps/desktop-electron` (vitest, Node environment) |
| Electron end to end | `apps/desktop-electron/e2e/` | `npm run test:e2e` in `apps/desktop-electron` (Playwright; run `npm run test:e2e:install` once) |

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

# Unit + integration (the default)
python scripts/run_tests.py

# Unit, integration, regression and system, in that order
python scripts/run_tests.py --all

# Exclude slow tests
python scripts/run_tests.py --unit --no-slow

# Specific module (run_tests.py takes no pytest options such as -k)
python -m pytest src/tests/unit/core/test_matcher.py -v
```

`run_tests.py` also takes `--integration`, `--system` and `--coverage`. Performance and acceptance tests run only when you point `python -m pytest` at them.

## Markers

| Marker | Purpose |
| --- | --- |
| `unit` | Unit tests |
| `integration` | Integration tests |
| `system` | System/CLI tests |
| `slow` | Long-running (excluded with `--no-slow`) |
| `performance` | Performance tests |
| `benchmark` | `pytest-benchmark` benchmarks |

`pytest.ini` sets `--strict-markers`, so a marker must be declared there before a test can use it.

## Coverage

`python scripts/run_tests.py --all --coverage --no-slow` is what `test.yml` runs. `release-gates.yml` fails a push whose unit-test coverage is under 35%.

## Adding a Unit Test

1. Create or extend `src/tests/unit/<module>/test_<name>.py`
2. Use pytest fixtures for setup
3. Mock external calls (`patch`, `MagicMock`)
4. Assert behavior, not implementation

## Adding an Integration Test

1. Create or extend `src/tests/integration/test_<name>.py`
2. Use real modules; mock only network/filesystem
3. Use fixtures from `src/tests/fixtures/`

## Fixtures

- `src/tests/fixtures/rekordbox/`: Sample XML files
- `src/tests/fixtures/beatport/`: Sample Beatport HTML pages and scoring baselines
- `src/tests/fixtures/beatport_v4/`: Recorded Beatport v4 API responses

See [Fixtures README](https://github.com/stuchain/CuePoint/blob/main/src/tests/fixtures/README.md).

## Related

- [Dev Sandbox](dev-sandbox.md)
- [Debug a Mismatch](debug-mismatch.md)
