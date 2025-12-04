# Fixing PySide6 Installation on macOS

## Quick Fix

PySide6 is now added to `requirements.txt`. Install it with:

```bash
pip3 install -r requirements.txt
```

Or install PySide6 directly:

```bash
pip3 install PySide6
```

## Common macOS Installation Issues

### Issue 1: "No module named PySide6"

**Solution:**
```bash
pip3 install PySide6
```

### Issue 2: Installation fails with build errors

**Possible causes:**
- Missing system dependencies
- Architecture mismatch (Intel vs Apple Silicon)
- Python version incompatibility

**Solutions:**

#### For Apple Silicon (M1/M2/M3 Macs):
```bash
# Make sure you're using the right Python
arch -arm64 python3 -m pip install PySide6
```

#### For Intel Macs:
```bash
python3 -m pip install PySide6
```

#### Install system dependencies (if needed):
```bash
# Using Homebrew
brew install python-tk

# Or install Xcode command line tools
xcode-select --install
```

### Issue 3: "pip3: command not found"

**Solution:**
```bash
# Install pip if missing
python3 -m ensurepip --upgrade

# Then install PySide6
python3 -m pip install PySide6
```

### Issue 4: Permission errors

**Solution - Install for user only:**
```bash
pip3 install --user PySide6
```

**Or use a virtual environment (recommended):**
```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install requirements
pip install -r requirements.txt

# When done, deactivate
deactivate
```

## Verify Installation

Test that PySide6 is installed correctly:

```bash
python3 -c "import PySide6; print('PySide6 version:', PySide6.__version__)"
```

Or test the full import:

```bash
python3 -c "from PySide6.QtWidgets import QApplication; print('✓ PySide6 OK')"
```

## Complete Installation Steps

1. **Update requirements.txt** (already done - PySide6 is now included)

2. **Install all requirements:**
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Verify PySide6:**
   ```bash
   python3 -c "import PySide6; print('PySide6 version:', PySide6.__version__)"
   ```

4. **Run the GUI:**
   ```bash
   ./run_gui.command
   ```

## If Still Having Issues

### Check Python version:
```bash
python3 --version
```
PySide6 requires Python 3.8+. If you have an older version, update Python.

### Check which Python pip is using:
```bash
pip3 --version
python3 -m pip --version
```

Make sure they match!

### Try installing from wheel (pre-built):
```bash
pip3 install --only-binary :all: PySide6
```

### Check for conflicting packages:
```bash
pip3 list | grep -i qt
pip3 list | grep -i pyside
```

If you see PyQt6 or old PySide versions, uninstall them first:
```bash
pip3 uninstall PyQt6 PyQt5 PySide2
pip3 install PySide6
```

## Architecture-Specific Notes

### Apple Silicon (M1/M2/M3)
- Use `arch -arm64 python3` to ensure you're using ARM64 Python
- PySide6 has native ARM64 support

### Intel Macs
- Standard x86_64 installation should work
- Use `python3` directly

## Still Not Working?

1. Check the full error message
2. Try installing with verbose output:
   ```bash
   pip3 install -v PySide6
   ```
3. Check if Qt libraries are available:
   ```bash
   brew list | grep qt
   ```
4. Try installing Qt via Homebrew first:
   ```bash
   brew install qt@6
   pip3 install PySide6
   ```

