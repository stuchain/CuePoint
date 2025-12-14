# Test Fixtures

This directory contains test fixtures used across all test layers.

## Directory Structure

- `rekordbox/`: Rekordbox XML fixtures
- `beatport/`: Beatport HTML response fixtures
- `exports/`: Golden files (expected outputs)
- `tracks/`: Track data fixtures

## Fixture Naming

Fixtures follow these naming conventions:
- Descriptive names that indicate purpose
- Scenario-based names for specific test cases
- `_edge_case` suffix for edge cases
- Version suffixes when fixtures evolve

## Usage

```python
from tests.fixtures import get_rekordbox_fixture, load_fixture

# Load a Rekordbox XML fixture
xml_path = get_rekordbox_fixture("minimal")

# Load fixture content
xml_content = load_fixture("rekordbox/minimal.xml")
```

## Fixture Guidelines

1. **Keep Fixtures Small**: Use minimal data that covers test scenarios
2. **Version Control**: All fixtures are committed to repository
3. **Document Changes**: Document why fixtures were updated
4. **Validate Fixtures**: Ensure fixtures are valid before committing

