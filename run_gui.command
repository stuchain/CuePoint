#!/bin/bash
# macOS double-clickable script to run CuePoint GUI application
# Double-click this file in Finder to run the GUI

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to SRC directory
cd "$SCRIPT_DIR/SRC" || {
    echo "Error: Could not change to SRC directory"
    echo "Press any key to exit..."
    read -n 1
    exit 1
}

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed or not in PATH"
    echo "Please install Python 3.7 or later"
    echo ""
    echo "Press any key to exit..."
    read -n 1
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
    echo ""
    echo "Press any key to close..."
    read -n 1
fi

exit $EXIT_CODE

