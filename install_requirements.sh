#!/bin/bash
# macOS/Linux script to install CuePoint requirements
# Equivalent to: pip install -r requirements.txt

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR" || {
    echo "Error: Could not change to script directory"
    exit 1
}

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed"
    echo ""
    echo "Please install Python 3.7 or later:"
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
echo "Installing PySide6 and other dependencies..."
pip3 install -r requirements.txt

# Check if PySide6 was installed successfully
echo ""
echo "Verifying PySide6 installation..."
python3 -c "import PySide6; print(f'✓ PySide6 {PySide6.__version__} installed successfully')" 2>/dev/null || {
    echo "⚠ Warning: PySide6 installation may have failed"
    echo "Trying to install PySide6 separately..."
    pip3 install PySide6
}

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Requirements installed successfully!"
    echo ""
    echo "Optional: Install additional dependencies for development:"
    echo "  pip3 install -r requirements-dev.txt"
    echo ""
    echo "Optional: Install optional dependencies:"
    echo "  pip3 install -r requirements_optional.txt"
    echo ""
else
    echo ""
    echo "✗ Installation failed. Please check the error messages above."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

read -p "Press Enter to exit..."

