#!/usr/bin/env python3
"""Fix config_service.py file"""

content = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Config Service Implementation

Service for managing configuration settings.
"""

from typing import Any, Dict, Optional
from cuepoint.services.interfaces import IConfigService
from cuepoint.models.config import SETTINGS


class ConfigService(IConfigService):
    """Implementation of configuration service."""
    
    def __init__(self, settings: Optional[Dict[str, Any]] = None):
        self._settings: Dict[str, Any] = settings.copy() if settings else SETTINGS.copy()
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        return self._settings.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value."""
        self._settings[key] = value
    
    def save(self) -> None:
        """Save configuration to persistent storage."""
        # For now, this is a no-op as settings are in-memory
        # Can be extended to save to YAML file
        pass
    
    def load(self) -> None:
        """Load configuration from persistent storage."""
        # For now, this is a no-op as settings are loaded from module
        # Can be extended to load from YAML file
        pass
'''

import os
path = os.path.join(os.path.dirname(__file__), 'cuepoint', 'services', 'config_service.py')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"File written to {path}")
print(f"File size: {os.path.getsize(path)} bytes")














