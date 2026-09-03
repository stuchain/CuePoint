#!/usr/bin/env bash
# macOS double-clickable launcher for the CuePoint Electron app.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$SCRIPT_DIR/apps/desktop-electron"

# Finder does not always inherit the shell's PATH. Include the standard
# Homebrew locations and load nvm as a fallback when it is installed.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
fi

if [ ! -f "$ELECTRON_DIR/package.json" ]; then
    echo "CuePoint desktop files were not found."
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js and npm are required to run CuePoint."
    echo "Install Node.js 22 or newer, then try again."
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

if [ ! -f "$ELECTRON_DIR/node_modules/electron/package.json" ]; then
    echo "CuePoint desktop dependencies are not installed."
    echo "Run npm install in apps/desktop-electron, then try again."
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

cd "$ELECTRON_DIR" || exit 1
npm run electron:start
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "CuePoint exited with code $EXIT_CODE."
    echo "Press any key to close..."
    read -n 1
fi

exit $EXIT_CODE

