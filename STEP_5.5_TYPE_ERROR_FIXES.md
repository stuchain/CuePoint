# Step 5.5: Type Error Fixes

## Issues Fixed

### 1. `cuepoint/utils/errors.py:219`
**Error**: Incompatible types in assignment (expression has type "int", target has type "str")

**Fix**: Convert `line_number` to string when assigning to context dictionary:
```python
context["Line number"] = str(line_number)
```

### 2. `cuepoint/utils/performance.py` (Multiple errors)
**Error**: Item "None" of "PerformanceStats | None" has no attribute "track_metrics" (and similar)

**Fix**: Added type guards with `assert self._stats is not None` after checking and initializing:
- Line 133: After `if not self._stats: self.start_session()`
- Line 172: Before accessing `self._stats.query_metrics`
- Line 209: Before accessing `self._stats.matched_tracks`
- Line 237: Before accessing `self._stats.filter_metrics`

### 3. `cuepoint/utils/di_container.py` (Lines 95, 100, 107)
**Error**: Returning Any from function declared to return "T"

**Fix**: Added `# type: ignore[return-value]` comments to return statements:
```python
return self._singletons[interface]  # type: ignore[return-value]
return instance  # type: ignore[return-value]
```

### 4. `cuepoint/utils/logger_helper.py:29`
**Error**: Only concrete class can be given where "type[ILoggingService]" is expected

**Fix**: Added type ignore comment:
```python
return container.resolve(ILoggingService)  # type: ignore[return-value]
```

### 5. `cuepoint/models/config.py:42`
**Error**: Library stubs not installed for "requests"

**Fix**: Added type ignore comment:
```python
import requests  # type: ignore[import-untyped]
```

### 6. `cuepoint/models/config.py:378`
**Error**: Need type annotation for "items"

**Fix**: Added type annotation and import:
```python
from typing import Any, List

items: list[tuple[str, Any]] = []
```

### 7. `cuepoint/models/config.py:334`
**Error**: Unused "type: ignore" comment

**Fix**: Removed the unused type ignore comment from `import requests_cache`

### 8. `cuepoint/models/config.py:477`
**Error**: Library stubs not installed for "yaml"

**Fix**: Added type ignore comment:
```python
import yaml  # type: ignore[import-untyped]
```

### 9. `cuepoint/utils/utils.py:182`
**Error**: Library stubs not installed for "requests.exceptions"

**Fix**: Added type ignore comment:
```python
from requests.exceptions import (  # type: ignore[import-untyped]
    ConnectionError,
    HTTPError,
```

## Files Modified

1. ✅ `src/cuepoint/utils/errors.py` - Fixed line_number type conversion
2. ✅ `src/cuepoint/utils/performance.py` - Added type guards for None checks
3. ✅ `src/cuepoint/utils/di_container.py` - Added type ignore comments
4. ✅ `src/cuepoint/utils/logger_helper.py` - Added type ignore comment
5. ✅ `src/cuepoint/models/config.py` - Fixed multiple type issues
6. ✅ `src/cuepoint/utils/utils.py` - Added type ignore for missing stubs

## Verification

Run mypy validation:
```bash
cd src
python -m mypy cuepoint/utils/ cuepoint/models/config.py --config-file=../mypy.ini
```

All type errors should now be resolved.

