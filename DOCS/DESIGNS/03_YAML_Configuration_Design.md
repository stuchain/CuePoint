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

---

## 11. GUI Settings Panel Integration

### 11.1 Settings Panel Widget Design

**Location**: `SRC/gui/settings_panel.py` (NEW)

**Component Structure**:
```python
# SRC/gui/settings_panel.py
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QGroupBox, QSpinBox, QDoubleSpinBox, QCheckBox,
    QPushButton, QComboBox, QLineEdit, QTabWidget,
    QFileDialog, QMessageBox
)
from PySide6.QtCore import Qt, Signal
from typing import Dict, Any

class SettingsPanel(QWidget):
    """GUI settings panel for configuration"""
    
    settings_changed = Signal(dict)  # Emit when settings change
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.settings = {}
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up settings panel UI"""
        layout = QVBoxLayout()
        
        # Tab widget for organized sections
        tabs = QTabWidget()
        
        # Performance tab
        perf_tab = self._create_performance_tab()
        tabs.addTab(perf_tab, "Performance")
        
        # Matching tab
        match_tab = self._create_matching_tab()
        tabs.addTab(match_tab, "Matching")
        
        # Query Generation tab
        query_tab = self._create_query_tab()
        tabs.addTab(query_tab, "Query Generation")
        
        # Network tab
        network_tab = self._create_network_tab()
        tabs.addTab(network_tab, "Network")
        
        # Search tab
        search_tab = self._create_search_tab()
        tabs.addTab(search_tab, "Search")
        
        # Logging tab
        logging_tab = self._create_logging_tab()
        tabs.addTab(logging_tab, "Logging")
        
        layout.addWidget(tabs)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        load_btn = QPushButton("Load from File...")
        load_btn.clicked.connect(self._load_from_file)
        button_layout.addWidget(load_btn)
        
        save_btn = QPushButton("Save to File...")
        save_btn.clicked.connect(self._save_to_file)
        button_layout.addWidget(save_btn)
        
        reset_btn = QPushButton("Reset to Defaults")
        reset_btn.clicked.connect(self._reset_to_defaults)
        button_layout.addWidget(reset_btn)
        
        button_layout.addStretch()
        
        apply_btn = QPushButton("Apply")
        apply_btn.clicked.connect(self._apply_settings)
        button_layout.addWidget(apply_btn)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def _create_performance_tab(self) -> QWidget:
        """Create performance settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Candidate Workers
        workers_layout = QHBoxLayout()
        workers_label = QLabel("Candidate Workers:")
        self.candidate_workers_spin = QSpinBox()
        self.candidate_workers_spin.setRange(1, 50)
        self.candidate_workers_spin.setValue(15)
        workers_layout.addWidget(workers_label)
        workers_layout.addWidget(self.candidate_workers_spin)
        workers_layout.addStretch()
        layout.addLayout(workers_layout)
        
        # Track Workers
        track_layout = QHBoxLayout()
        track_label = QLabel("Track Workers:")
        self.track_workers_spin = QSpinBox()
        self.track_workers_spin.setRange(1, 20)
        self.track_workers_spin.setValue(12)
        track_layout.addWidget(track_label)
        track_layout.addWidget(self.track_workers_spin)
        track_layout.addStretch()
        layout.addLayout(track_layout)
        
        # Time Budget
        budget_layout = QHBoxLayout()
        budget_label = QLabel("Time Budget (seconds):")
        self.time_budget_spin = QSpinBox()
        self.time_budget_spin.setRange(10, 300)
        self.time_budget_spin.setValue(45)
        budget_layout.addWidget(budget_label)
        budget_layout.addWidget(self.time_budget_spin)
        budget_layout.addStretch()
        layout.addLayout(budget_layout)
        
        # Max Search Results
        results_layout = QHBoxLayout()
        results_label = QLabel("Max Search Results:")
        self.max_results_spin = QSpinBox()
        self.max_results_spin.setRange(10, 100)
        self.max_results_spin.setValue(50)
        results_layout.addWidget(results_label)
        results_layout.addWidget(self.max_results_spin)
        results_layout.addStretch()
        layout.addLayout(results_layout)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def _create_matching_tab(self) -> QWidget:
        """Create matching settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Min Accept Score
        min_layout = QHBoxLayout()
        min_label = QLabel("Min Accept Score:")
        self.min_score_spin = QSpinBox()
        self.min_score_spin.setRange(0, 200)
        self.min_score_spin.setValue(70)
        min_layout.addWidget(min_label)
        min_layout.addWidget(self.min_score_spin)
        min_layout.addStretch()
        layout.addLayout(min_layout)
        
        # Early Exit Score
        exit_layout = QHBoxLayout()
        exit_label = QLabel("Early Exit Score:")
        self.exit_score_spin = QSpinBox()
        self.exit_score_spin.setRange(0, 200)
        self.exit_score_spin.setValue(90)
        exit_layout.addWidget(exit_label)
        exit_layout.addWidget(self.exit_score_spin)
        exit_layout.addStretch()
        layout.addLayout(exit_layout)
        
        # Early Exit Min Queries
        queries_layout = QHBoxLayout()
        queries_label = QLabel("Early Exit Min Queries:")
        self.exit_queries_spin = QSpinBox()
        self.exit_queries_spin.setRange(1, 50)
        self.exit_queries_spin.setValue(8)
        queries_layout.addWidget(queries_label)
        queries_layout.addWidget(self.exit_queries_spin)
        queries_layout.addStretch()
        layout.addLayout(queries_layout)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def _create_query_tab(self) -> QWidget:
        """Create query generation settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Title Gram Max
        gram_layout = QHBoxLayout()
        gram_label = QLabel("Title Gram Max:")
        self.title_gram_spin = QSpinBox()
        self.title_gram_spin.setRange(1, 5)
        self.title_gram_spin.setValue(2)
        gram_layout.addWidget(gram_label)
        gram_layout.addWidget(self.title_gram_spin)
        gram_layout.addStretch()
        layout.addLayout(gram_layout)
        
        # Max Queries Per Track
        max_q_layout = QHBoxLayout()
        max_q_label = QLabel("Max Queries Per Track:")
        self.max_queries_spin = QSpinBox()
        self.max_queries_spin.setRange(10, 100)
        self.max_queries_spin.setValue(40)
        max_q_layout.addWidget(max_q_label)
        max_q_layout.addWidget(self.max_queries_spin)
        max_q_layout.addStretch()
        layout.addLayout(max_q_layout)
        
        # Cross Title Grams
        cross_check = QCheckBox("Cross Title Grams with Artists")
        cross_check.setChecked(False)
        self.cross_grams_check = cross_check
        layout.addWidget(cross_check)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def _create_network_tab(self) -> QWidget:
        """Create network settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Connect Timeout
        connect_layout = QHBoxLayout()
        connect_label = QLabel("Connect Timeout (seconds):")
        self.connect_timeout_spin = QSpinBox()
        self.connect_timeout_spin.setRange(1, 30)
        self.connect_timeout_spin.setValue(3)
        connect_layout.addWidget(connect_label)
        connect_layout.addWidget(self.connect_timeout_spin)
        connect_layout.addStretch()
        layout.addLayout(connect_layout)
        
        # Read Timeout
        read_layout = QHBoxLayout()
        read_label = QLabel("Read Timeout (seconds):")
        self.read_timeout_spin = QSpinBox()
        self.read_timeout_spin.setRange(1, 60)
        self.read_timeout_spin.setValue(8)
        read_layout.addWidget(read_label)
        read_layout.addWidget(self.read_timeout_spin)
        read_layout.addStretch()
        layout.addLayout(read_layout)
        
        # Enable Cache
        cache_check = QCheckBox("Enable Cache")
        cache_check.setChecked(True)
        self.enable_cache_check = cache_check
        layout.addWidget(cache_check)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def _create_search_tab(self) -> QWidget:
        """Create search settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Use Direct Search for Remixes
        remix_check = QCheckBox("Use Direct Search for Remixes")
        remix_check.setChecked(True)
        self.direct_remix_check = remix_check
        layout.addWidget(remix_check)
        
        # Prefer Direct Search
        prefer_check = QCheckBox("Prefer Direct Search")
        prefer_check.setChecked(False)
        self.prefer_direct_check = prefer_check
        layout.addWidget(prefer_check)
        
        # Use Browser Automation
        browser_check = QCheckBox("Use Browser Automation")
        browser_check.setChecked(True)
        self.browser_check = browser_check
        layout.addWidget(browser_check)
        
        # Browser Timeout
        browser_timeout_layout = QHBoxLayout()
        browser_timeout_label = QLabel("Browser Timeout (seconds):")
        self.browser_timeout_spin = QSpinBox()
        self.browser_timeout_spin.setRange(10, 120)
        self.browser_timeout_spin.setValue(30)
        browser_timeout_layout.addWidget(browser_timeout_label)
        browser_timeout_layout.addWidget(self.browser_timeout_spin)
        browser_timeout_layout.addStretch()
        layout.addLayout(browser_timeout_layout)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def _create_logging_tab(self) -> QWidget:
        """Create logging settings tab"""
        widget = QWidget()
        layout = QVBoxLayout()
        
        # Verbose
        verbose_check = QCheckBox("Verbose Logging")
        verbose_check.setChecked(False)
        self.verbose_check = verbose_check
        layout.addWidget(verbose_check)
        
        # Trace
        trace_check = QCheckBox("Trace Logging")
        trace_check.setChecked(False)
        self.trace_check = trace_check
        layout.addWidget(trace_check)
        
        # Seed
        seed_layout = QHBoxLayout()
        seed_label = QLabel("Random Seed:")
        self.seed_spin = QSpinBox()
        self.seed_spin.setRange(0, 999999)
        self.seed_spin.setValue(0)
        seed_layout.addWidget(seed_label)
        seed_layout.addWidget(self.seed_spin)
        seed_layout.addStretch()
        layout.addLayout(seed_layout)
        
        layout.addStretch()
        widget.setLayout(layout)
        return widget
    
    def load_settings(self, settings: Dict[str, Any]):
        """Load settings into UI"""
        self.settings = settings
        
        # Performance
        self.candidate_workers_spin.setValue(settings.get('CANDIDATE_WORKERS', 15))
        self.track_workers_spin.setValue(settings.get('TRACK_WORKERS', 12))
        self.time_budget_spin.setValue(settings.get('PER_TRACK_TIME_BUDGET_SEC', 45))
        self.max_results_spin.setValue(settings.get('MAX_SEARCH_RESULTS', 50))
        
        # Matching
        self.min_score_spin.setValue(settings.get('MIN_ACCEPT_SCORE', 70))
        self.exit_score_spin.setValue(settings.get('EARLY_EXIT_SCORE', 90))
        self.exit_queries_spin.setValue(settings.get('EARLY_EXIT_MIN_QUERIES', 8))
        
        # Query Generation
        self.title_gram_spin.setValue(settings.get('TITLE_GRAM_MAX', 2))
        self.max_queries_spin.setValue(settings.get('MAX_QUERIES_PER_TRACK', 40))
        self.cross_grams_check.setChecked(settings.get('CROSS_TITLE_GRAMS_WITH_ARTISTS', False))
        
        # Network
        self.connect_timeout_spin.setValue(settings.get('CONNECT_TIMEOUT', 3))
        self.read_timeout_spin.setValue(settings.get('READ_TIMEOUT', 8))
        self.enable_cache_check.setChecked(settings.get('HAVE_CACHE', True))
        
        # Search
        self.direct_remix_check.setChecked(settings.get('USE_DIRECT_SEARCH_FOR_REMIXES', True))
        self.prefer_direct_check.setChecked(settings.get('PREFER_DIRECT_SEARCH', False))
        self.browser_check.setChecked(settings.get('USE_BROWSER_AUTOMATION', True))
        self.browser_timeout_spin.setValue(settings.get('BROWSER_TIMEOUT_SEC', 30))
        
        # Logging
        self.verbose_check.setChecked(settings.get('VERBOSE', False))
        self.trace_check.setChecked(settings.get('TRACE', False))
        self.seed_spin.setValue(settings.get('SEED', 0))
    
    def get_settings(self) -> Dict[str, Any]:
        """Get settings from UI"""
        return {
            # Performance
            'CANDIDATE_WORKERS': self.candidate_workers_spin.value(),
            'TRACK_WORKERS': self.track_workers_spin.value(),
            'PER_TRACK_TIME_BUDGET_SEC': self.time_budget_spin.value(),
            'MAX_SEARCH_RESULTS': self.max_results_spin.value(),
            
            # Matching
            'MIN_ACCEPT_SCORE': self.min_score_spin.value(),
            'EARLY_EXIT_SCORE': self.exit_score_spin.value(),
            'EARLY_EXIT_MIN_QUERIES': self.exit_queries_spin.value(),
            
            # Query Generation
            'TITLE_GRAM_MAX': self.title_gram_spin.value(),
            'MAX_QUERIES_PER_TRACK': self.max_queries_spin.value(),
            'CROSS_TITLE_GRAMS_WITH_ARTISTS': self.cross_grams_check.isChecked(),
            
            # Network
            'CONNECT_TIMEOUT': self.connect_timeout_spin.value(),
            'READ_TIMEOUT': self.read_timeout_spin.value(),
            'HAVE_CACHE': self.enable_cache_check.isChecked(),
            
            # Search
            'USE_DIRECT_SEARCH_FOR_REMIXES': self.direct_remix_check.isChecked(),
            'PREFER_DIRECT_SEARCH': self.prefer_direct_check.isChecked(),
            'USE_BROWSER_AUTOMATION': self.browser_check.isChecked(),
            'BROWSER_TIMEOUT_SEC': self.browser_timeout_spin.value(),
            
            # Logging
            'VERBOSE': self.verbose_check.isChecked(),
            'TRACE': self.trace_check.isChecked(),
            'SEED': self.seed_spin.value(),
        }
    
    def _load_from_file(self):
        """Load settings from YAML file"""
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Load Configuration", "", "YAML Files (*.yaml *.yml);;All Files (*.*)"
        )
        if file_path:
            try:
                from config import load_config_from_yaml
                settings = load_config_from_yaml(file_path)
                self.load_settings(settings)
                QMessageBox.information(self, "Settings", "Configuration loaded successfully!")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to load configuration:\n{str(e)}")
    
    def _save_to_file(self):
        """Save settings to YAML file"""
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save Configuration", "", "YAML Files (*.yaml *.yml);;All Files (*.*)"
        )
        if file_path:
            try:
                import yaml
                settings = self.get_settings()
                
                # Convert to nested structure for user-friendly YAML
                nested = self._flatten_to_nested(settings)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    yaml.dump(nested, f, default_flow_style=False, sort_keys=False)
                
                QMessageBox.information(self, "Settings", "Configuration saved successfully!")
            except Exception as e:
                QMessageBox.critical(self, "Error", f"Failed to save configuration:\n{str(e)}")
    
    def _reset_to_defaults(self):
        """Reset to default settings"""
        from config import SETTINGS
        self.load_settings(SETTINGS)
    
    def _apply_settings(self):
        """Apply settings"""
        settings = self.get_settings()
        self.settings_changed.emit(settings)
```

### 11.2 Integration with MainWindow

**Settings Dialog**:

```python
# SRC/gui/main_window.py
from PySide6.QtWidgets import QDialog, QDialogButtonBox
from .settings_panel import SettingsPanel

class SettingsDialog(QDialog):
    """Settings dialog"""
    
    def __init__(self, current_settings: dict, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumSize(600, 500)
        
        layout = QVBoxLayout()
        
        self.settings_panel = SettingsPanel()
        self.settings_panel.load_settings(current_settings)
        layout.addWidget(self.settings_panel)
        
        buttons = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel | QDialogButtonBox.RestoreDefaults
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        buttons.button(QDialogButtonBox.RestoreDefaults).clicked.connect(
            self.settings_panel._reset_to_defaults
        )
        layout.addWidget(buttons)
        
        self.setLayout(layout)
    
    def get_settings(self) -> dict:
        """Get settings from panel"""
        return self.settings_panel.get_settings()

# In MainWindow
def _show_settings(self):
    """Show settings dialog"""
    dialog = SettingsDialog(self.current_settings, self)
    if dialog.exec_() == QDialog.Accepted:
        new_settings = dialog.get_settings()
        # Apply settings
        self._apply_settings(new_settings)
```

### 11.3 Preset Management

**Preset Selector**:

```python
# Add preset selector to settings panel
preset_combo = QComboBox()
preset_combo.addItems(["Custom", "Fast", "Thorough", "Balanced"])
preset_combo.currentTextChanged.connect(self._apply_preset)

def _apply_preset(self, preset_name: str):
    """Apply preset configuration"""
    presets = {
        'Fast': {
            'CANDIDATE_WORKERS': 20,
            'TRACK_WORKERS': 15,
            'MIN_ACCEPT_SCORE': 60,
            'EARLY_EXIT_SCORE': 85,
        },
        'Thorough': {
            'CANDIDATE_WORKERS': 10,
            'TRACK_WORKERS': 5,
            'MIN_ACCEPT_SCORE': 80,
            'EARLY_EXIT_SCORE': 95,
        },
        # ... more presets
    }
    
    if preset_name in presets:
        self.load_settings(presets[preset_name])
```

### 11.4 Acceptance Criteria for GUI Integration

- [ ] Settings panel displays all settings correctly
- [ ] Settings can be loaded from YAML file
- [ ] Settings can be saved to YAML file
- [ ] Settings validation works
- [ ] Preset management works
- [ ] Settings apply correctly to processing
- [ ] UI is organized and user-friendly

---

**Document Version**: 2.0  
**Last Updated**: 2025-01-27  
**Author**: CuePoint Development Team  
**GUI Integration**: Complete

