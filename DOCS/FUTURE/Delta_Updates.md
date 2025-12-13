# Delta Updates (Future - v1.1+)

## v1.0 Status
- ❌ Not implemented
- ✅ Full installer updates only
- ✅ No delta/patch updates
- ✅ All updates download complete installer

## v1.1+ Implementation Plan

### Why Delta Updates?
- Reduce download sizes (especially for large updates)
- Faster update installation
- Better user experience
- Reduced bandwidth costs

### Implementation Options

#### Option 1: Binary Diff (bsdiff/bspatch)
- Use bsdiff to create binary patches
- Apply patches with bspatch
- Pros: Works for any binary format
- Cons: Requires full old version available

#### Option 2: File-Level Diff
- Compare file-by-file
- Only download changed files
- Pros: More granular, can skip unchanged files
- Cons: More complex, requires file manifest

#### Option 3: Archive-Level Diff
- Diff entire app bundle/installer
- Apply patch to recreate new version
- Pros: Single patch file
- Cons: Large patches for small changes

### Recommended Approach
- Use bsdiff for binary patches
- Generate patches during CI/CD
- Include patch size in appcast
- Fall back to full installer if patch fails

## Technical Implementation

### Patch Generation (CI/CD)
```python
# scripts/generate_delta.py
import bsdiff4
from pathlib import Path

def generate_delta(old_version: str, new_version: str):
    """Generate delta update patch"""
    old_file = Path(f"dist/CuePoint-v{old_version}.dmg")
    new_file = Path(f"dist/CuePoint-v{new_version}.dmg")
    patch_file = Path(f"patches/v{old_version}-to-v{new_version}.patch")
    
    # Generate patch
    with open(old_file, 'rb') as old, open(new_file, 'rb') as new:
        old_data = old.read()
        new_data = new.read()
        patch_data = bsdiff4.diff(old_data, new_data)
    
    # Save patch
    patch_file.write_bytes(patch_data)
    
    # Calculate size
    patch_size = patch_file.stat().st_size
    full_size = new_file.stat().st_size
    savings = (1 - patch_size / full_size) * 100
    
    print(f"Patch size: {patch_size} bytes ({savings:.1f}% smaller)")
```

### Patch Application (App)
```python
# SRC/cuepoint/services/delta_updater.py (v1.1+)
import bsdiff4
from pathlib import Path

def apply_delta_patch(old_file: Path, patch_file: Path, output_file: Path):
    """Apply delta patch to create new version"""
    with open(old_file, 'rb') as old, open(patch_file, 'rb') as patch:
        old_data = old.read()
        patch_data = patch.read()
        new_data = bsdiff4.patch(old_data, patch_data)
    
    output_file.write_bytes(new_data)
```

### Appcast Enhancement
- Add `<delta>` element to appcast items
- Include patch URL, size, signature
- Client checks patch availability before downloading

### Fallback Strategy
- Always provide full installer as fallback
- If patch fails, download full installer
- If patch unavailable, use full installer

## Rationale for Exclusion
- Full installer updates are simpler to implement
- Initial releases likely to have significant changes
- Delta updates add complexity (patch generation, verification)
- Can be added when update frequency increases
