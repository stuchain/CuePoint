#!/usr/bin/env python3
"""Fix all Step 5.2 files that have write issues"""

import os
import sys

base = os.path.dirname(__file__)

# Read the actual content from the files we created
files_to_fix = [
    'cuepoint/utils/di_container.py',
    'cuepoint/services/interfaces.py', 
    'cuepoint/services/cache_service.py',
    'cuepoint/services/bootstrap.py',
]

for filepath in files_to_fix:
    full_path = os.path.join(base, filepath)
    # Read from the file we can see
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Delete and rewrite
        os.remove(full_path)
        with open(full_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        size = os.path.getsize(full_path)
        print(f"[OK] {filepath} ({size} bytes)")
    except Exception as e:
        print(f"[ERROR] {filepath}: {e}")

print("\nAll files fixed! Now testing imports...")

# Test imports
sys.path.insert(0, base)
try:
    from cuepoint.utils.di_container import DIContainer, get_container, reset_container
    from cuepoint.services.interfaces import IProcessorService, ICacheService
    from cuepoint.services.cache_service import CacheService
    from cuepoint.services.bootstrap import bootstrap_services
    print("[SUCCESS] All imports work!")
except Exception as e:
    print(f"[ERROR] Import failed: {e}")
    import traceback
    traceback.print_exc()


