#!/bin/bash
# Create Release Tag Script
# Creates a git tag for a release version
# Usage: ./create_release_tag.sh <version>
# Example: ./create_release_tag.sh 1.0.0

set -e

VERSION="${1}"

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 1.0.0"
    exit 1
fi

# Validate version format (SemVer)
if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be SemVer format (X.Y.Z)"
    echo "Example: 1.0.0"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory is not clean"
    echo "Please commit or stash changes before creating a release tag"
    exit 1
fi

# Check if tag exists
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
    echo "Error: Tag v${VERSION} already exists"
    exit 1
fi

# Verify version in version.py matches
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

VERSION_IN_FILE=$(python -c "import sys; sys.path.insert(0, 'SRC'); from cuepoint.version import get_version; print(get_version())" 2>/dev/null || echo "")

if [ -z "$VERSION_IN_FILE" ]; then
    echo "Warning: Could not read version from version.py"
    echo "Continuing anyway..."
elif [ "$VERSION_IN_FILE" != "$VERSION" ]; then
    echo "Error: Version in version.py ($VERSION_IN_FILE) does not match tag version ($VERSION)"
    echo "Please update version.py first"
    exit 1
fi

# Update build info (optional, for pre-release builds)
if [ -f "scripts/set_build_info.py" ]; then
    echo "Setting build info..."
    python scripts/set_build_info.py || echo "Warning: Could not set build info"
fi

# Create annotated tag
echo "Creating tag v${VERSION}..."
git tag -a "v${VERSION}" -m "Release v${VERSION}"

echo ""
echo "✓ Created tag v${VERSION}"
echo ""
echo "Next steps:"
echo "  1. Review the tag: git show v${VERSION}"
echo "  2. Push the tag: git push origin v${VERSION}"
echo "  3. This will trigger the release workflow (if configured)"
