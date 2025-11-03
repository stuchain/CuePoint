# Design: Configuration File Support (YAML)

**Number**: 3  
**Status**: ✅ Implemented  
**Priority**: 🔥 P0 - Quick Win  
**Effort**: 1-2 days  
**Impact**: Medium-High

---

## 1. Overview

### 1.1 Problem Statement

Users had to modify `config.py` directly or use command-line presets to change settings. This approach had limitations:
- No easy way to save/share configurations
- Hard to manage multiple configuration presets
- CLI presets were limited and fixed
- No version control for configurations

### 1.2 Solution Overview

Implement YAML configuration file support that:
1. Allows saving settings to external YAML files
2. Supports nested, user-friendly structure
3. Merges with defaults and CLI flags (priority system)
4. Validates settings with helpful error messages
5. Includes template file for easy setup

---

## 2. Architecture Design

### 2.1 Configuration Priority System

```
Priority Order (highest to lowest):
1. CLI flags (--verbose, --seed, etc.)
2. CLI presets (--fast, --turbo, --myargs)
3. YAML configuration file (--config)
4. Default settings (config.py)
```

### 2.2 Configuration Loading Flow

```
Start Application
    ↓
Load Default Settings (config.py)
    ↓
Parse CLI Arguments
    ↓
Load YAML File (if --config specified)
    ├─ Parse YAML
    ├─ Flatten nested structure
    ├─ Map to SETTINGS keys
    ├─ Validate types
    └─ Merge with defaults
    ↓
Apply CLI Presets (--fast, --turbo, etc.)
    ↓
Apply CLI Flags (--verbose, --seed, etc.)
    ↓
Final Configuration Ready
```

---

## 3. YAML File Structure

### 3.1 Nested Structure

**User-Friendly Organization**:
```yaml
# config.yaml
performance:
  candidate_workers: 15
  track_workers: 12
  time_budget_sec: 45
  max_search_results: 50

matching:
  min_accept_score: 70
  early_exit_score: 90
  early_exit_min_queries: 8

query_generation:
  title_gram_max: 2
  max_queries_per_track: 40
  cross_title_grams_with_artists: false

network:
  connect_timeout: 3
  read_timeout: 8
  enable_cache: true

search:
  use_direct_search_for_remixes: true
  prefer_direct_search: false
  use_browser_automation: true
  browser_timeout_sec: 30

logging:
  verbose: false
  trace: false

determinism:
  seed: 0
```

### 3.2 Direct Key Support

**Also Supports Direct SETTINGS Keys**:
```yaml
# Alternative format using direct keys
CANDIDATE_WORKERS: 15
TRACK_WORKERS: 12
PER_TRACK_TIME_BUDGET_SEC: 45
MIN_ACCEPT_SCORE: 70
```

---

## 4. Implementation Details

### 4.1 YAML Loading Function

**Location**: `SRC/config.py`

```python
def load_config_from_yaml(yaml_path: str) -> dict:
    """
    Load configuration settings from a YAML file
    
    Args:
        yaml_path: Path to YAML configuration file
    
    Returns:
        Dictionary of settings to merge into SETTINGS
    
    Raises:
        FileNotFoundError: If YAML file doesn't exist
        yaml.YAMLError: If YAML file is invalid
        ValueError: If YAML contains invalid setting values
    """
    try:
        import yaml
    except ImportError:
        raise ImportError(
            "YAML support requires pyyaml. Install with: pip install pyyaml>=6.0"
        )
    
    if not os.path.exists(yaml_path):
        raise FileNotFoundError(f"Configuration file not found: {yaml_path}")
    
    with open(yaml_path, "r", encoding="utf-8") as f:
        yaml_content = yaml.safe_load(f)
    
    if not isinstance(yaml_content, dict):
        raise ValueError(f"YAML file must contain a dictionary at root level: {yaml_path}")
    
    # Flatten nested structure
    flattened = _flatten_yaml_dict(yaml_content)
    
    # Map to SETTINGS keys
    settings_dict = _map_yaml_keys_to_settings(flattened)
    
    # Validate setting types
    _validate_settings(settings_dict)
    
    return settings_dict
```

### 4.2 Flattening Nested Structure

**Function**: `_flatten_yaml_dict()`

```python
def _flatten_yaml_dict(nested_dict: dict, parent_key: str = "", sep: str = "_") -> dict:
    """
    Flatten a nested dictionary structure to match SETTINGS keys
    
    Converts nested YAML structure to flat dictionary keys:
    {"performance": {"candidate_workers": 15}} -> {"PERFORMANCE_CANDIDATE_WORKERS": 15}
    """
    items = []
    for key, value in nested_dict.items():
        # Convert key to uppercase to match SETTINGS convention
        new_key = key.upper()
        if parent_key:
            new_key = f"{parent_key}{sep}{new_key}"
        
        if isinstance(value, dict):
            # Recursively flatten nested dictionaries
            items.extend(_flatten_yaml_dict(value, new_key, sep=sep).items())
        else:
            items.append((new_key, value))
    return dict(items)
```

**Example**:
```yaml
# Input YAML
performance:
  candidate_workers: 15
  track_workers: 12
```
```python
# Flattened output
{
    "PERFORMANCE_CANDIDATE_WORKERS": 15,
    "PERFORMANCE_TRACK_WORKERS": 12
}
```

### 4.3 Key Mapping

**Function**: `_map_yaml_keys_to_settings()`

```python
def _map_yaml_keys_to_settings(yaml_dict: dict) -> dict:
    """
    Map YAML file keys to SETTINGS dictionary keys
    
    Handles both nested keys (performance.candidate_workers) and direct keys (CANDIDATE_WORKERS)
    """
    key_mapping = {
        "PERFORMANCE_CANDIDATE_WORKERS": "CANDIDATE_WORKERS",
        "PERFORMANCE_TRACK_WORKERS": "TRACK_WORKERS",
        "PERFORMANCE_TIME_BUDGET_SEC": "PER_TRACK_TIME_BUDGET_SEC",
        "PERFORMANCE_MAX_SEARCH_RESULTS": "MAX_SEARCH_RESULTS",
        "MATCHING_MIN_ACCEPT_SCORE": "MIN_ACCEPT_SCORE",
        "MATCHING_EARLY_EXIT_SCORE": "EARLY_EXIT_SCORE",
        # ... more mappings ...
    }
    
    result = {}
    for key, value in yaml_dict.items():
        # Try mapping first, then use key directly if it matches SETTINGS
        mapped_key = key_mapping.get(key, key)
        
        # Only include keys that exist in SETTINGS
        if mapped_key in SETTINGS:
            result[mapped_key] = value
        elif key in SETTINGS:
            # Allow direct SETTINGS keys
            result[key] = value
        # Silently ignore unknown keys (allows YAML files with extra comments/sections)
    
    return result
```

### 4.4 Type Validation

**Function**: `_validate_settings()`

```python
def _validate_settings(settings_dict: dict) -> None:
    """Validate setting types and convert if needed"""
    for key, value in settings_dict.items():
        default_value = SETTINGS.get(key)
        if default_value is not None:
            # Type check: ensure YAML value matches default type
            if type(value) != type(default_value):
                # Allow int/float conversion for numeric types
                if isinstance(default_value, (int, float)) and isinstance(value, (int, float)):
                    pass  # OK - both numeric
                elif isinstance(default_value, bool) and isinstance(value, (str, int)):
                    # Convert string/int to bool
                    if isinstance(value, str):
                        settings_dict[key] = value.lower() in ("true", "1", "yes", "on")
                    else:
                        settings_dict[key] = bool(value)
                elif isinstance(default_value, (int, float)) and isinstance(value, str):
                    # Try to convert string to number
                    try:
                        if isinstance(default_value, int):
                            settings_dict[key] = int(value)
                        else:
                            settings_dict[key] = float(value)
                    except ValueError:
                        raise ValueError(
                            f"Setting {key} expects {type(default_value).__name__}, "
                            f"got {type(value).__name__} ({value})"
                        )
                else:
                    raise ValueError(
                        f"Setting {key} expects {type(default_value).__name__}, "
                        f"got {type(value).__name__} ({value})"
                    )
```

---

## 5. CLI Integration

### 5.1 Command-Line Argument

**Location**: `SRC/main.py`

```python
ap.add_argument(
    "--config",
    type=str,
    default=None,
    help="Path to YAML configuration file - settings in file are merged with defaults, CLI flags override file settings"
)
```

### 5.2 Configuration Loading

```python
# Load configuration from YAML file if specified
if args.config:
    try:
        yaml_settings = load_config_from_yaml(args.config)
        SETTINGS.update(yaml_settings)
        print(f"Loaded configuration from: {args.config}")
    except FileNotFoundError as e:
        print_error(error_file_not_found(args.config, "Configuration", "Check the --config file path"))
    except ValueError as e:
        print_error(error_config_invalid(args.config, e, ...))
    except ImportError as e:
        if "yaml" in str(e).lower():
            print_error(error_missing_dependency("pyyaml", "pip install pyyaml>=6.0"))
```

---

## 6. Template File

### 6.1 Template Structure

**File**: `config.yaml.template`

```yaml
# CuePoint Configuration Template
# Copy this file to config.yaml and customize as needed
# Settings are merged with defaults, CLI flags override file settings

# Performance Settings
performance:
  candidate_workers: 15          # Parallel threads for candidate fetching
  track_workers: 12              # Parallel threads for track processing
  time_budget_sec: 45            # Max time per track (seconds)
  max_search_results: 50         # Max results per query

# Matching Settings
matching:
  min_accept_score: 70           # Minimum score to accept match
  early_exit_score: 90          # Score threshold for early exit
  early_exit_min_queries: 8     # Min queries before early exit allowed

# Query Generation
query_generation:
  title_gram_max: 2              # Max N-gram size for title
  max_queries_per_track: 40     # Hard cap on queries per track
  cross_title_grams_with_artists: false  # Cross title grams with artists

# Network Settings
network:
  connect_timeout: 3             # HTTP connection timeout (seconds)
  read_timeout: 8                # HTTP read timeout (seconds)
  enable_cache: true             # Enable HTTP response caching

# Search Strategy
search:
  use_direct_search_for_remixes: true   # Auto-use direct search for remixes
  prefer_direct_search: false           # Use direct search for all queries
  use_browser_automation: true          # Enable browser automation
  browser_timeout_sec: 30               # Browser operation timeout

# Logging
logging:
  verbose: false                 # Enable verbose logging
  trace: false                    # Enable trace-level logging

# Determinism
determinism:
  seed: 0                         # Random seed for reproducibility
```

---

## 7. Error Handling

### 7.1 Validation Errors

**Invalid Type**:
```
ERROR: Configuration Invalid

Setting performance.candidate_workers expects int, got str ("15")
Suggested fix: Remove quotes around numbers in YAML
```

**Invalid Key**:
```yaml
# Unknown key is silently ignored (allows comments/extra sections)
unknown_setting: value  # This will be ignored
```

**Invalid Value**:
```
ERROR: Configuration Invalid

Setting matching.min_accept_score expects int, got str ("seventy")
Suggested fix: Use numeric value: 70
```

---

## 8. Usage Examples

### 8.1 Basic Usage

```bash
# Create config file
cp config.yaml.template config.yaml

# Edit config.yaml with your settings

# Use config file
python main.py --xml collection.xml --playlist "My Playlist" --config config.yaml
```

### 8.2 Override with CLI Flags

```bash
# Config file sets candidate_workers=15
# CLI flag overrides to 20
python main.py --xml collection.xml --playlist "My Playlist" \
    --config config.yaml \
    --myargs  # This will override config file settings
```

### 8.3 Multiple Config Files

```bash
# Use different configs for different purposes
python main.py --xml collection.xml --playlist "My Playlist" --config fast_config.yaml
python main.py --xml collection.xml --playlist "My Playlist" --config thorough_config.yaml
```

---

## 9. Benefits

### 9.1 User Benefits

- **Easy Configuration**: No need to edit Python files
- **Version Control**: Config files can be versioned
- **Sharing**: Easy to share configurations
- **Presets**: Create multiple preset configs

### 9.2 Development Benefits

- **Flexibility**: Users can customize without code changes
- **Documentation**: YAML files serve as documentation
- **Testing**: Easy to test different configurations

---

## 10. Dependencies

### 10.1 Required

- `pyyaml>=6.0`: YAML parsing library

### 10.2 Installation

```bash
pip install pyyaml>=6.0
```

Already in `requirements.txt`.

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

