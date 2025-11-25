# Step 6.8: Configuration Management

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: Step 6.1 (Project Structure), Step 6.2 (Dependency Injection)

---

## Goal

Centralize and improve configuration management with support for multiple configuration sources (file, environment variables, command-line arguments) and validation.

---

## Success Criteria

- [ ] Configuration model classes created
- [ ] Configuration service implemented
- [ ] Multiple config sources supported (file, env, CLI)
- [ ] Configuration validation implemented
- [ ] Configuration UI updated
- [ ] All configuration options documented
- [ ] Configuration loading tested
- [ ] Configuration validation tested

---

## Configuration Architecture

### Configuration Sources Priority

1. **Command-line arguments** (highest priority)
2. **Environment variables**
3. **User configuration file** (`~/.cuepoint/config.yaml`)
4. **Default configuration** (lowest priority)

### Configuration Model

```python
# src/cuepoint/models/config.py

"""Configuration models."""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from pathlib import Path

@dataclass
class BeatportConfig:
    """Beatport API configuration."""
    base_url: str = "https://www.beatport.com"
    timeout: int = 30
    max_retries: int = 3
    rate_limit_delay: float = 1.0

@dataclass
class CacheConfig:
    """Cache configuration."""
    enabled: bool = True
    max_size: int = 1000
    ttl_default: int = 3600
    ttl_search: int = 3600
    ttl_track: int = 86400

@dataclass
class ProcessingConfig:
    """Processing configuration."""
    max_concurrent: int = 5
    timeout_per_track: int = 60
    min_confidence: float = 0.0
    max_candidates: int = 10

@dataclass
class ExportConfig:
    """Export configuration."""
    default_format: str = "csv"
    default_directory: Optional[Path] = None
    include_candidates: bool = False

@dataclass
class LoggingConfig:
    """Logging configuration."""
    level: str = "INFO"
    file_enabled: bool = True
    console_enabled: bool = True
    log_dir: Optional[Path] = None
    max_file_size: int = 10 * 1024 * 1024  # 10 MB
    backup_count: int = 5

@dataclass
class UIConfig:
    """UI configuration."""
    theme: str = "default"
    font_size: int = 10
    window_width: int = 1200
    window_height: int = 800
    remember_window_size: bool = True

@dataclass
class AppConfig:
    """Main application configuration."""
    beatport: BeatportConfig = field(default_factory=BeatportConfig)
    cache: CacheConfig = field(default_factory=CacheConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)
    export: ExportConfig = field(default_factory=ExportConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    ui: UIConfig = field(default_factory=UIConfig)
    
    @classmethod
    def default(cls) -> "AppConfig":
        """Create default configuration."""
        return cls()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "beatport": {
                "base_url": self.beatport.base_url,
                "timeout": self.beatport.timeout,
                "max_retries": self.beatport.max_retries,
                "rate_limit_delay": self.beatport.rate_limit_delay
            },
            "cache": {
                "enabled": self.cache.enabled,
                "max_size": self.cache.max_size,
                "ttl_default": self.cache.ttl_default,
                "ttl_search": self.cache.ttl_search,
                "ttl_track": self.cache.ttl_track
            },
            "processing": {
                "max_concurrent": self.processing.max_concurrent,
                "timeout_per_track": self.processing.timeout_per_track,
                "min_confidence": self.processing.min_confidence,
                "max_candidates": self.processing.max_candidates
            },
            "export": {
                "default_format": self.export.default_format,
                "default_directory": str(self.export.default_directory) if self.export.default_directory else None,
                "include_candidates": self.export.include_candidates
            },
            "logging": {
                "level": self.logging.level,
                "file_enabled": self.logging.file_enabled,
                "console_enabled": self.logging.console_enabled,
                "log_dir": str(self.logging.log_dir) if self.logging.log_dir else None,
                "max_file_size": self.logging.max_file_size,
                "backup_count": self.logging.backup_count
            },
            "ui": {
                "theme": self.ui.theme,
                "font_size": self.ui.font_size,
                "window_width": self.ui.window_width,
                "window_height": self.ui.window_height,
                "remember_window_size": self.ui.remember_window_size
            }
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AppConfig":
        """Create configuration from dictionary."""
        config = cls.default()
        
        if "beatport" in data:
            beatport_data = data["beatport"]
            config.beatport = BeatportConfig(
                base_url=beatport_data.get("base_url", config.beatport.base_url),
                timeout=beatport_data.get("timeout", config.beatport.timeout),
                max_retries=beatport_data.get("max_retries", config.beatport.max_retries),
                rate_limit_delay=beatport_data.get("rate_limit_delay", config.beatport.rate_limit_delay)
            )
        
        # Similar for other sections...
        
        return config
```

---

## Configuration Service

### Service Interface

```python
# src/cuepoint/services/interfaces.py (addition)

class IConfigService(ABC):
    """Interface for configuration management."""
    
    @abstractmethod
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key (dot notation)."""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any) -> None:
        """Set configuration value by key (dot notation)."""
        pass
    
    @abstractmethod
    def save(self) -> None:
        """Save configuration to persistent storage."""
        pass
    
    @abstractmethod
    def load(self) -> None:
        """Load configuration from persistent storage."""
        pass
    
    @abstractmethod
    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        pass
    
    @abstractmethod
    def validate(self) -> List[str]:
        """Validate configuration. Returns list of errors."""
        pass
```

### Service Implementation

```python
# src/cuepoint/services/config_service.py

"""Configuration service implementation."""

import os
import yaml
from pathlib import Path
from typing import Any, List, Optional, Dict
from cuepoint.services.interfaces import IConfigService
from cuepoint.models.config import AppConfig
from cuepoint.utils.validators import validate_config_value

class ConfigService(IConfigService):
    """Configuration service with multiple sources."""
    
    def __init__(self, config_file: Optional[Path] = None):
        """Initialize configuration service.
        
        Args:
            config_file: Path to configuration file. Defaults to user config dir.
        """
        if config_file is None:
            config_dir = Path.home() / ".cuepoint"
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / "config.yaml"
        
        self.config_file = config_file
        self.config = AppConfig.default()
        self.load()
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key (dot notation).
        
        Args:
            key: Configuration key in dot notation (e.g., "beatport.timeout").
            default: Default value if key not found.
        
        Returns:
            Configuration value or default.
        
        Example:
            >>> service.get("beatport.timeout")
            30
            >>> service.get("beatport.unknown", default=10)
            10
        """
        keys = key.split(".")
        value = self.config
        
        try:
            for k in keys:
                value = getattr(value, k)
            return value
        except AttributeError:
            return default
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value by key (dot notation).
        
        Args:
            key: Configuration key in dot notation.
            value: Value to set.
        
        Example:
            >>> service.set("beatport.timeout", 60)
        """
        keys = key.split(".")
        obj = self.config
        
        # Navigate to parent object
        for k in keys[:-1]:
            obj = getattr(obj, k)
        
        # Set value
        setattr(obj, keys[-1], value)
    
    def save(self) -> None:
        """Save configuration to file."""
        try:
            with open(self.config_file, 'w') as f:
                yaml.dump(self.config.to_dict(), f, default_flow_style=False)
        except Exception as e:
            raise ConfigurationError(f"Failed to save configuration: {e}")
    
    def load(self) -> None:
        """Load configuration from multiple sources."""
        # Start with defaults
        self.config = AppConfig.default()
        
        # Load from file if exists
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    file_data = yaml.safe_load(f) or {}
                    self.config = AppConfig.from_dict(file_data)
            except Exception as e:
                # Log error but continue with defaults
                print(f"Warning: Failed to load config file: {e}")
        
        # Override with environment variables
        self._load_from_env()
        
        # Validate configuration
        errors = self.validate()
        if errors:
            raise ConfigurationError(f"Configuration validation failed: {errors}")
    
    def _load_from_env(self) -> None:
        """Load configuration from environment variables."""
        env_mappings = {
            "CUEPOINT_BEATPORT_TIMEOUT": ("beatport.timeout", int),
            "CUEPOINT_BEATPORT_MAX_RETRIES": ("beatport.max_retries", int),
            "CUEPOINT_CACHE_ENABLED": ("cache.enabled", bool),
            "CUEPOINT_PROCESSING_MAX_CONCURRENT": ("processing.max_concurrent", int),
            "CUEPOINT_LOGGING_LEVEL": ("logging.level", str),
        }
        
        for env_var, (config_key, type_converter) in env_mappings.items():
            value = os.getenv(env_var)
            if value is not None:
                try:
                    converted_value = type_converter(value)
                    self.set(config_key, converted_value)
                except (ValueError, TypeError):
                    # Skip invalid environment variables
                    pass
    
    def reset_to_defaults(self) -> None:
        """Reset configuration to defaults."""
        self.config = AppConfig.default()
        self.save()
    
    def validate(self) -> List[str]:
        """Validate configuration.
        
        Returns:
            List of validation errors (empty if valid).
        """
        errors = []
        
        # Validate beatport config
        if self.config.beatport.timeout < 1:
            errors.append("beatport.timeout must be >= 1")
        
        if self.config.beatport.max_retries < 0:
            errors.append("beatport.max_retries must be >= 0")
        
        # Validate cache config
        if self.config.cache.max_size < 1:
            errors.append("cache.max_size must be >= 1")
        
        # Validate processing config
        if self.config.processing.max_concurrent < 1:
            errors.append("processing.max_concurrent must be >= 1")
        
        if not 0.0 <= self.config.processing.min_confidence <= 1.0:
            errors.append("processing.min_confidence must be between 0.0 and 1.0")
        
        # Validate logging config
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.config.logging.level.upper() not in valid_levels:
            errors.append(f"logging.level must be one of {valid_levels}")
        
        return errors
```

---

## Configuration File Format

### YAML Configuration File

**config/default.yaml:**
```yaml
beatport:
  base_url: "https://www.beatport.com"
  timeout: 30
  max_retries: 3
  rate_limit_delay: 1.0

cache:
  enabled: true
  max_size: 1000
  ttl_default: 3600
  ttl_search: 3600
  ttl_track: 86400

processing:
  max_concurrent: 5
  timeout_per_track: 60
  min_confidence: 0.0
  max_candidates: 10

export:
  default_format: "csv"
  default_directory: null
  include_candidates: false

logging:
  level: "INFO"
  file_enabled: true
  console_enabled: true
  log_dir: null
  max_file_size: 10485760  # 10 MB
  backup_count: 5

ui:
  theme: "default"
  font_size: 10
  window_width: 1200
  window_height: 800
  remember_window_size: true
```

---

## Command-Line Configuration

### CLI Argument Parsing

```python
# src/cuepoint/cli.py

"""Command-line interface for configuration."""

import argparse
from pathlib import Path
from cuepoint.services.config_service import ConfigService

def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="CuePoint Beatport Metadata Enricher")
    
    # Configuration options
    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file"
    )
    
    parser.add_argument(
        "--beatport-timeout",
        type=int,
        help="Beatport API timeout in seconds"
    )
    
    parser.add_argument(
        "--cache-enabled",
        action="store_true",
        help="Enable caching"
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level"
    )
    
    return parser.parse_args()

def apply_cli_config(args, config_service: ConfigService):
    """Apply command-line arguments to configuration."""
    if args.beatport_timeout:
        config_service.set("beatport.timeout", args.beatport_timeout)
    
    if args.cache_enabled is not None:
        config_service.set("cache.enabled", args.cache_enabled)
    
    if args.log_level:
        config_service.set("logging.level", args.log_level)
```

---

## Configuration UI

### Config Panel Updates

```python
# src/cuepoint/ui/widgets/config_panel.py (updates)

from cuepoint.services.interfaces import IConfigService

class ConfigPanel(QWidget):
    """Configuration panel widget."""
    
    def __init__(self, config_service: IConfigService, parent=None):
        super().__init__(parent)
        self.config_service = config_service
        self.init_ui()
        self.load_config()
    
    def load_config(self):
        """Load configuration into UI."""
        # Beatport settings
        self.beatport_timeout_spinbox.setValue(
            self.config_service.get("beatport.timeout", 30)
        )
        
        # Cache settings
        self.cache_enabled_checkbox.setChecked(
            self.config_service.get("cache.enabled", True)
        )
        
        # Processing settings
        self.max_concurrent_spinbox.setValue(
            self.config_service.get("processing.max_concurrent", 5)
        )
        
        # ... load other settings ...
    
    def save_config(self):
        """Save configuration from UI."""
        # Beatport settings
        self.config_service.set(
            "beatport.timeout",
            self.beatport_timeout_spinbox.value()
        )
        
        # Cache settings
        self.config_service.set(
            "cache.enabled",
            self.cache_enabled_checkbox.isChecked()
        )
        
        # Processing settings
        self.config_service.set(
            "processing.max_concurrent",
            self.max_concurrent_spinbox.value()
        )
        
        # ... save other settings ...
        
        # Save to file
        self.config_service.save()
        
        # Validate
        errors = self.config_service.validate()
        if errors:
            QMessageBox.warning(self, "Configuration Error", "\n".join(errors))
```

---

## Implementation Checklist

- [ ] Create configuration model classes
- [ ] Implement configuration service
- [ ] Support file-based configuration (YAML)
- [ ] Support environment variables
- [ ] Support command-line arguments
- [ ] Implement configuration validation
- [ ] Update configuration UI
- [ ] Document all configuration options
- [ ] Test configuration loading
- [ ] Test configuration validation
- [ ] Test configuration saving
- [ ] Test configuration priority (CLI > env > file > defaults)

---

## Configuration Documentation

**docs/configuration.md:**
```markdown
# Configuration Guide

## Configuration Sources

Configuration is loaded from multiple sources in priority order:
1. Command-line arguments
2. Environment variables
3. User configuration file (`~/.cuepoint/config.yaml`)
4. Default values

## Configuration Options

### Beatport Settings
- `beatport.timeout`: API timeout in seconds (default: 30)
- `beatport.max_retries`: Maximum retry attempts (default: 3)

### Cache Settings
- `cache.enabled`: Enable caching (default: true)
- `cache.max_size`: Maximum cache size (default: 1000)

## Environment Variables

- `CUEPOINT_BEATPORT_TIMEOUT`: Beatport API timeout
- `CUEPOINT_CACHE_ENABLED`: Enable/disable cache
```

---

## Next Steps

After completing this step:
1. Verify configuration loading works
2. Test configuration validation
3. Update UI to use configuration service
4. Proceed to Step 6.9: Refactor Data Models

