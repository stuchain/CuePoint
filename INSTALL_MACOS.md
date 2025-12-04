# Installing CuePoint on macOS

## Quick Start

### Option 1: Using the Install Script (Recommended)

1. **Make the script executable** (one-time setup):
   ```bash
   chmod +x install_requirements.sh
   ```

2. **Double-click `install_requirements.sh`** in Finder, or run:
   ```bash
   ./install_requirements.sh
   ```

### Option 2: Manual Installation

1. **Open Terminal** (Applications → Utilities → Terminal)

2. **Navigate to the CuePoint folder**:
   ```bash
   cd /path/to/CuePoint
   ```

3. **Install requirements**:
   ```bash
   pip3 install -r requirements.txt
   ```

## Prerequisites

### Python 3.7 or later

**Check if Python is installed:**
```bash
python3 --version
```

**If not installed, choose one method:**

#### Method 1: Official Python Installer (Recommended)
1. Visit https://www.python.org/downloads/
2. Download Python 3.x for macOS
3. Run the installer
4. Make sure to check "Add Python to PATH" during installation

#### Method 2: Homebrew (For developers)
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python3
```

#### Method 3: MacPorts
```bash
sudo port install python39
```

## Installation Steps

### 1. Install Core Requirements
```bash
pip3 install -r requirements.txt
```

This installs:
- PySide6 (Qt GUI framework)
- requests (HTTP library)
- beautifulsoup4 (HTML parsing)
- rapidfuzz (fuzzy string matching)
- playwright (browser automation)
- openpyxl (Excel export)
- And other dependencies...

### 2. Install Optional Dependencies (Optional)
```bash
pip3 install -r requirements_optional.txt
```

### 3. Install Development Dependencies (Optional, for developers)
```bash
pip3 install -r requirements-dev.txt
```

### 4. Install Playwright Browsers (Required for web scraping)
After installing requirements, you need to install browser binaries:
```bash
playwright install chromium
```

Or install all browsers:
```bash
playwright install
```

## Verify Installation

Test that everything is installed correctly:
```bash
python3 -c "import PySide6; print('PySide6 OK')"
python3 -c "import requests; print('requests OK')"
python3 -c "import playwright; print('playwright OK')"
```

## Running the GUI

After installation, you can run the GUI:

### Option 1: Double-click `run_gui.command`
(Make it executable first: `chmod +x run_gui.command`)

### Option 2: From Terminal
```bash
cd SRC
python3 gui_app.py
```

### Option 3: Using the shell script
```bash
./run_gui.sh
```

## Troubleshooting

### "python3: command not found"
- Install Python 3 (see Prerequisites above)
- Make sure Python is in your PATH

### "pip3: command not found"
- Python 3.4+ should include pip3
- Try: `python3 -m ensurepip --upgrade`

### "Permission denied" errors
- Use `pip3 install --user -r requirements.txt` to install for your user only
- Or use a virtual environment (recommended for development)

### Virtual Environment (Recommended for Development)

Create an isolated environment:
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

### Playwright Issues

If Playwright doesn't work:
```bash
# Reinstall browsers
playwright install chromium

# Or check installation
playwright --version
```

## Next Steps

1. ✅ Install requirements
2. ✅ Install Playwright browsers
3. ✅ Run the GUI: `./run_gui.command` or `python3 SRC/gui_app.py`
4. 🎉 Start using CuePoint!

## Need Help?

- Check the main README.md for general information
- Check error messages in Terminal for specific issues
- Make sure all prerequisites are installed

