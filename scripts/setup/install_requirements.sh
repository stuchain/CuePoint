#!/bin/bash
# macOS/Linux script to install CuePoint requirements
# Equivalent to: pip install -r requirements.txt

# The repository root, two levels above this script (scripts/setup/), where the
# requirements files are.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

cd "$REPO_ROOT" || {
    echo "Error: Could not change to the repository root"
    exit 1
}

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed"
    echo ""
    echo "Please install Python 3.11 or later:"
    echo "  1. Visit https://www.python.org/downloads/"
    echo "  2. Download and install Python 3 for macOS"
    echo "  3. Or use Homebrew: brew install python3"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if pip3 is available
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 is not installed"
    echo "Installing pip..."
    python3 -m ensurepip --upgrade
fi

echo "Installing CuePoint requirements..."
echo "This may take a few minutes..."
echo ""

# Install requirements
if pip3 install -r requirements.txt; then
    echo ""
    echo "✓ Requirements installed successfully!"
    echo ""
    echo "Optional: Install additional dependencies for development:"
    echo "  pip3 install -r requirements-dev.txt"
    echo ""
    echo "Optional: for the Beatport browser fallback, install the Playwright browser:"
    echo "  playwright install chromium"
    echo ""
else
    echo ""
    echo "✗ Installation failed. Please check the error messages above."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

read -p "Press Enter to exit..."
