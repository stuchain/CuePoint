# How to Test Step 5.8: Configuration Management

This guide shows you how to test all aspects of Step 5.8.

## Quick Test (All Tests)

### Option 1: Run All Step 5.8 Tests
```bash
cd SRC
python -m pytest tests/unit/test_step58_config_models.py tests/unit/test_step58_config_service.py -v
```

### Option 2: Use the Test Runner Script
```bash
cd SRC
python run_step58_tests.py
```

### Option 3: Run with Coverage
```bash
cd SRC
python -m pytest tests/unit/test_step58_config_models.py tests/unit/test_step58_config_service.py -v --cov=cuepoint.models.config_models --cov=cuepoint.services.config_service --cov-report=term-missing
```

## Individual Test Categories

### Test Configuration Models Only
```bash
cd SRC
python -m pytest tests/unit/test_step58_config_models.py -v
```

**What it tests:**
- All configuration model classes (BeatportConfig, CacheConfig, etc.)
- Default values
- Custom values
- Serialization (to_dict, from_dict)
- Round-trip conversion

### Test ConfigService Only
```bash
cd SRC
python -m pytest tests/unit/test_step58_config_service.py -v
```

**What it tests:**
- Service initialization
- Get/Set operations (dot notation and legacy keys)
- File save/load operations
- Environment variable loading
- Configuration validation
- Reset to defaults
- Error handling

## Specific Test Scenarios

### Test Configuration Models - Specific Class
```bash
# Test BeatportConfig
cd SRC
python -m pytest tests/unit/test_step58_config_models.py::TestBeatportConfig -v

# Test AppConfig
python -m pytest tests/unit/test_step58_config_models.py::TestAppConfig -v
```

### Test ConfigService - Specific Feature
```bash
# Test file operations
cd SRC
python -m pytest tests/unit/test_step58_config_service.py::TestConfigServiceFileOperations -v

# Test environment variables
python -m pytest tests/unit/test_step58_config_service.py::TestConfigServiceEnvironmentVariables -v

# Test validation
python -m pytest tests/unit/test_step58_config_service.py::TestConfigServiceValidation -v
```

## Manual Testing (Interactive)

### Test Configuration Models

```python
# Start Python in SRC directory
cd SRC
python

# Import models
from cuepoint.models.config_models import AppConfig, BeatportConfig

# Test default configuration
config = AppConfig.default()
print(config.beatport.timeout)  # Should print: 30
print(config.cache.enabled)     # Should print: True

# Test custom values
config.beatport.timeout = 60
print(config.beatport.timeout)  # Should print: 60

# Test serialization
data = config.to_dict()
print(data["beatport"]["timeout"])  # Should print: 60

# Test deserialization
new_config = AppConfig.from_dict(data)
print(new_config.beatport.timeout)  # Should print: 60
```

### Test ConfigService

```python
# Start Python in SRC directory
cd SRC
python

# Import service
from cuepoint.services.config_service import ConfigService
from pathlib import Path
import tempfile

# Test with temporary config file
with tempfile.TemporaryDirectory() as tmpdir:
    config_file = Path(tmpdir) / "config.yaml"
    
    # Create service
    service = ConfigService(config_file=config_file)
    
    # Test get (dot notation)
    print(service.get("beatport.timeout"))  # Should print: 30
    print(service.get("cache.enabled"))     # Should print: True
    
    # Test set
    service.set("beatport.timeout", 60)
    print(service.get("beatport.timeout"))   # Should print: 60
    
    # Test save
    service.save()
    print(f"Config saved to: {config_file}")
    
    # Test load
    service2 = ConfigService(config_file=config_file)
    print(service2.get("beatport.timeout"))   # Should print: 60
    
    # Test validation
    errors = service.validate()
    print(f"Validation errors: {errors}")    # Should print: []
    
    # Test invalid value
    service.set("beatport.timeout", 0)       # Invalid: must be >= 1
    errors = service.validate()
    print(f"Validation errors: {errors}")    # Should show error
```

### Test Environment Variables

```bash
# Set environment variables
export CUEPOINT_BEATPORT_TIMEOUT=60
export CUEPOINT_CACHE_ENABLED=false
export CUEPOINT_LOGGING_LEVEL=DEBUG

# Run Python
cd SRC
python

# Test loading from environment
from cuepoint.services.config_service import ConfigService
from pathlib import Path
import tempfile

with tempfile.TemporaryDirectory() as tmpdir:
    config_file = Path(tmpdir) / "config.yaml"
    service = ConfigService(config_file=config_file)
    
    # Should use environment variable values
    print(service.get("beatport.timeout"))    # Should print: 60 (from env)
    print(service.get("cache.enabled"))      # Should print: False (from env)
    print(service.get("logging.level"))      # Should print: DEBUG (from env)
```

## Integration Testing

### Test with Real Config File

```python
# Create a real config file
from cuepoint.services.config_service import ConfigService
from pathlib import Path
import yaml

# Create config directory
config_dir = Path.home() / ".cuepoint"
config_dir.mkdir(exist_ok=True)
config_file = config_dir / "config.yaml"

# Create test configuration
config_data = {
    "beatport": {
        "timeout": 60,
        "max_retries": 5
    },
    "cache": {
        "enabled": False,
        "max_size": 2000
    },
    "processing": {
        "track_workers": 20,
        "candidate_workers": 25
    }
}

# Save to file
with open(config_file, "w") as f:
    yaml.dump(config_data, f)

# Load and verify
service = ConfigService(config_file=config_file)
print(service.get("beatport.timeout"))        # Should print: 60
print(service.get("cache.enabled"))          # Should print: False
print(service.get("processing.track_workers")) # Should print: 20
```

## Test Validation

### Test Validation Rules

```python
from cuepoint.services.config_service import ConfigService
from pathlib import Path
import tempfile

with tempfile.TemporaryDirectory() as tmpdir:
    config_file = Path(tmpdir) / "config.yaml"
    service = ConfigService(config_file=config_file)
    
    # Test valid configuration
    errors = service.validate()
    print(f"Default config errors: {errors}")  # Should be: []
    
    # Test invalid beatport timeout
    service.set("beatport.timeout", 0)
    errors = service.validate()
    print(f"Invalid timeout errors: {errors}")  # Should show error
    
    # Test invalid cache size
    service.reset_to_defaults()
    service.set("cache.max_size", 0)
    errors = service.validate()
    print(f"Invalid cache size errors: {errors}")  # Should show error
    
    # Test invalid logging level
    service.reset_to_defaults()
    service.set("logging.level", "INVALID")
    errors = service.validate()
    print(f"Invalid log level errors: {errors}")  # Should show error
```

## Test Results Summary

After running tests, you should see:

```
============================= test session starts ==============================
tests/unit/test_step58_config_models.py::TestBeatportConfig::test_default_values PASSED
tests/unit/test_step58_config_models.py::TestBeatportConfig::test_custom_values PASSED
...
tests/unit/test_step58_config_service.py::TestConfigServiceInitialization::test_init_default_config_file PASSED
tests/unit/test_step58_config_service.py::TestConfigServiceGet::test_get_dot_notation PASSED
...
============================= 45 passed in 3.19s ==============================
```

## Troubleshooting

### If tests fail:

1. **Check dependencies:**
   ```bash
   pip install pytest pyyaml
   ```

2. **Check Python path:**
   ```bash
   cd SRC
   python -c "import sys; print(sys.path)"
   ```

3. **Run with verbose output:**
   ```bash
   python -m pytest tests/unit/test_step58_config_models.py -vv
   ```

4. **Check for import errors:**
   ```bash
   python -c "from cuepoint.models.config_models import AppConfig; print('OK')"
   python -c "from cuepoint.services.config_service import ConfigService; print('OK')"
   ```

## Quick Verification Checklist

- [ ] All 45 tests pass
- [ ] Configuration models can be created with defaults
- [ ] Configuration can be serialized/deserialized
- [ ] ConfigService can get/set values with dot notation
- [ ] ConfigService can save/load from YAML file
- [ ] Environment variables override file configuration
- [ ] Validation catches invalid values
- [ ] Reset to defaults works correctly

## Next Steps

After testing:
1. Review test output for any warnings
2. Check coverage report if generated
3. Verify configuration works in actual application
4. Proceed to Step 5.9: Refactor Data Models

