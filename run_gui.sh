#!/bin/bash
# macOS/Linux script to run CuePoint GUI application
# Equivalent to run_gui.bat on Windows
# Note: On macOS, use run_gui.command for double-click execution

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to SRC directory
cd "$SCRIPT_DIR/SRC" || {
    echo "Error: Could not change to SRC directory"
    exit 1
}

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed or not in PATH"
    echo "Please install Python 3.7 or later"
    exit 1
fi

# Run the GUI application
echo "Starting CuePoint GUI..."
python3 gui_app.py

# Capture exit code
EXIT_CODE=$?

# If there was an error, wait for user input before closing
if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "Application exited with error code: $EXIT_CODE"
    read -p "Press Enter to close..."
fi

exit $EXIT_CODE

