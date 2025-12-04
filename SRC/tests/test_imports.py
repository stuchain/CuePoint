#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Test imports for Step 5.2"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Testing imports...")

try:
    from cuepoint.utils.di_container import DIContainer, get_container, reset_container
    print("✓ di_container imports successful")
    
    # Test instantiation
    container = DIContainer()
    print("✓ DIContainer can be instantiated")
    
    # Test functions
    reset_container()
    container = get_container()
    print("✓ get_container and reset_container work")
    
except Exception as e:
    print(f"✗ di_container import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.cache_service import CacheService, CacheEntry
    print("✓ cache_service imports successful")
    
    # Test instantiation
    cache = CacheService()
    print("✓ CacheService can be instantiated")
    
except Exception as e:
    print(f"✗ cache_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.logging_service import LoggingService
    print("✓ logging_service imports successful")
    
except Exception as e:
    print(f"✗ logging_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.config_service import ConfigService
    print("✓ config_service imports successful")
    
except Exception as e:
    print(f"✗ config_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.export_service import ExportService
    print("✓ export_service imports successful")
    
except Exception as e:
    print(f"✗ export_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.matcher_service import MatcherService
    print("✓ matcher_service imports successful")
    
except Exception as e:
    print(f"✗ matcher_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.beatport_service import BeatportService
    print("✓ beatport_service imports successful")
    
except Exception as e:
    print(f"✗ beatport_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.processor_service import ProcessorService
    print("✓ processor_service imports successful")
    
except Exception as e:
    print(f"✗ processor_service import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

try:
    from cuepoint.services.bootstrap import bootstrap_services
    print("✓ bootstrap imports successful")
    
except Exception as e:
    print(f"✗ bootstrap import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\nAll imports successful!")
