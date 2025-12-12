#!/bin/bash
# macOS/Linux script to run CuePoint GUI application
# Equivalent to run_gui.bat on Windows
# Note: On macOS, use run_gui.command for double-click execution

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Prefer project-local venv for a ship-ready, consistent runtime
PY="$SCRIPT_DIR/.venv/bin/python"
if [ -x "$PY" ]; then
    echo "Using project virtualenv: $PY"
else
    PY="$(command -v python3)"
fi

if [ -z "$PY" ]; then
    echo "Error: python3 is not installed or not in PATH"
    echo "Recommended: install Python 3.11+ (OpenSSL-backed) and create .venv"
    exit 1
fi

# Show SSL backend (helps detect LibreSSL vs OpenSSL)
"$PY" -c "import ssl; print('Python:', __import__('sys').version.split()[0]); print('SSL:', ssl.OPENSSL_VERSION)" 2>/dev/null

# Change to SRC directory
cd "$SCRIPT_DIR/SRC" || {
    echo "Error: Could not change to SRC directory"
    exit 1
}

# Run the GUI application
echo "Starting CuePoint GUI..."
"$PY" gui_app.py

# Capture exit code
EXIT_CODE=$?

# If there was an error, wait for user input before closing
if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "Application exited with error code: $EXIT_CODE"
    read -p "Press Enter to close..."
fi

exit $EXIT_CODE

