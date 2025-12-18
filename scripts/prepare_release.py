#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Release Preparation Script

Helps prepare for a new release by:
- Validating version
- Checking CHANGELOG
- Running release readiness checks
- Generating release notes
- Preparing release tag
"""

import argparse
import subprocess
import sys
from pathlib import Path


def check_git_status():
    """Check if git working directory is clean."""
    result = subprocess.run(
        ['git', 'status', '--porcelain'],
        capture_output=True,
        text=True,
        check=False
    )
    
    if result.stdout.strip():
        print("Warning: Working directory has uncommitted changes:")
        print(result.stdout)
        response = input("Continue anyway? (y/N): ")
        if response.lower() != 'y':
            return False
    
    return True


def validate_version(version: str) -> bool:
    """Validate version string format."""
    parts = version.split('.')
    if len(parts) != 3:
        print(f"Error: Version must be in format X.Y.Z, got: {version}")
        return False
    
    try:
        for part in parts:
            int(part)
    except ValueError:
        print(f"Error: Version parts must be numbers, got: {version}")
        return False
    
    return True


def check_changelog(version: str) -> bool:
    """Check if CHANGELOG has entry for version."""
    changelog_path = Path('CHANGELOG.md')
    
    if not changelog_path.exists():
        print("Warning: CHANGELOG.md not found")
        return False
    
    content = changelog_path.read_text(encoding='utf-8')
    
    # Check for version entry
    if f"## [{version}]" in content or f"## {version}" in content:
        print(f"[OK] CHANGELOG.md has entry for {version}")
        return True
    else:
        print(f"Warning: CHANGELOG.md may not have entry for {version}")
        print("Please ensure CHANGELOG.md is updated before release")
        return False


def run_release_readiness():
    """Run release readiness checks."""
    script_path = Path('scripts/release_readiness.py')
    
    if not script_path.exists():
        print("Warning: release_readiness.py not found, skipping checks")
        return True
    
    print("Running release readiness checks...")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=False,
        check=False
    )
    
    return result.returncode == 0


def generate_release_notes(version: str) -> str:
    """Generate release notes from CHANGELOG."""
    changelog_path = Path('CHANGELOG.md')
    
    if not changelog_path.exists():
        return f"# CuePoint v{version}\n\nSee CHANGELOG.md for details."
    
    content = changelog_path.read_text(encoding='utf-8')
    
    # Extract version section
    version_marker = f"## [{version}]" if f"## [{version}]" in content else f"## {version}"
    
    if version_marker in content:
        # Extract section until next version
        start_idx = content.find(version_marker)
        next_section = content.find('## [', start_idx + 1)
        if next_section == -1:
            next_section = content.find('## ', start_idx + len(version_marker))
        
        if next_section > start_idx:
            section = content[start_idx:next_section].strip()
            return section
    
    return f"# CuePoint v{version}\n\nSee CHANGELOG.md for details."


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description='Prepare for a new CuePoint release'
    )
    parser.add_argument(
        'version',
        help='Version number (e.g., 1.0.1)'
    )
    parser.add_argument(
        '--skip-checks',
        action='store_true',
        help='Skip release readiness checks'
    )
    parser.add_argument(
        '--skip-git-check',
        action='store_true',
        help='Skip git status check'
    )
    parser.add_argument(
        '--generate-notes',
        action='store_true',
        help='Generate release notes file'
    )
    parser.add_argument(
        '--create-tag',
        action='store_true',
        help='Create git tag (does not push)'
    )
    
    args = parser.parse_args()
    
    version = args.version
    if version.startswith('v'):
        version = version[1:]
    
    print("=" * 60)
    print("CuePoint Release Preparation")
    print("=" * 60)
    print(f"Version: {version}")
    print()
    
    # Validate version
    if not validate_version(version):
        sys.exit(1)
    
    # Check git status
    if not args.skip_git_check:
        if not check_git_status():
            print("Aborted: Please commit or stash changes first")
            sys.exit(1)
    
    # Check CHANGELOG
    changelog_ok = check_changelog(version)
    if not changelog_ok:
        response = input("Continue anyway? (y/N): ")
        if response.lower() != 'y':
            sys.exit(1)
    
    # Run release readiness checks
    if not args.skip_checks:
        if not run_release_readiness():
            print("Warning: Some release readiness checks failed")
            response = input("Continue anyway? (y/N): ")
            if response.lower() != 'y':
                sys.exit(1)
    
    # Generate release notes
    if args.generate_notes:
        notes = generate_release_notes(version)
        notes_path = Path('RELEASE_NOTES.md')
        notes_path.write_text(notes, encoding='utf-8')
        print(f"[OK] Generated release notes: {notes_path}")
    
    # Create tag
    if args.create_tag:
        tag_name = f"v{version}"
        print(f"Creating tag: {tag_name}")
        
        result = subprocess.run(
            ['git', 'tag', tag_name],
            check=False
        )
        
        if result.returncode == 0:
            print(f"[OK] Created tag: {tag_name}")
            print(f"Push tag with: git push origin {tag_name}")
        else:
            print(f"Error: Failed to create tag (may already exist)")
            sys.exit(1)
    
    print()
    print("=" * 60)
    print("Release Preparation Complete")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Review generated files (if any)")
    print("2. Create git tag: git tag v{version}")
    print("3. Push tag: git push origin v{version}")
    print("4. Monitor GitHub Actions workflows")
    print("5. Verify release artifacts")
    print()


if __name__ == '__main__':
    main()
