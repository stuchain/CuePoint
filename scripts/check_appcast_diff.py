#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Check if appcast files have actually changed.

This script compares the generated appcast files with what's in gh-pages
to verify if there are actual differences.
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd: list, cwd: Path = None) -> tuple:
    """Run a shell command."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False
        )
        return (result.returncode, result.stdout, result.stderr)
    except Exception as e:
        return (1, "", str(e))


def main():
    """Main function"""
    repo_root = Path(__file__).parent.parent
    
    print("=== Checking Appcast Differences ===\n")
    
    # Fetch latest from gh-pages
    print("Fetching latest from gh-pages...")
    returncode, _, _ = run_command(['git', 'fetch', 'origin', 'gh-pages'], cwd=repo_root)
    if returncode != 0:
        print("Warning: Could not fetch gh-pages")
    
    appcast_files = [
        'updates/macos/stable/appcast.xml',
        'updates/windows/stable/appcast.xml'
    ]
    
    for appcast_file in appcast_files:
        local_path = repo_root / appcast_file
        remote_path = f'origin/gh-pages:{appcast_file}'
        
        print(f"\n--- {appcast_file} ---")
        
        # Check if local file exists
        if not local_path.exists():
            print(f"  Local file does not exist: {local_path}")
            continue
        
        # Get remote file content
        returncode, remote_content, _ = run_command(
            ['git', 'show', remote_path],
            cwd=repo_root
        )
        
        if returncode != 0:
            print(f"  Remote file does not exist in gh-pages")
            print(f"  Local file exists - will be a new file")
            continue
        
        # Get local file content
        local_content = local_path.read_text(encoding='utf-8')
        
        # Compare
        if local_content == remote_content:
            print(f"  [IDENTICAL] Files are identical - no changes")
        else:
            print(f"  [DIFFERENT] Files have differences")
            
            # Show diff
            returncode, diff_output, _ = run_command(
                ['git', 'diff', '--no-index', '--', remote_path, str(local_path)],
                cwd=repo_root
            )
            if diff_output:
                # Show first 20 lines of diff
                lines = diff_output.split('\n')[:20]
                print(f"  Diff preview (first 20 lines):")
                for line in lines:
                    print(f"    {line}")
                if len(diff_output.split('\n')) > 20:
                    print(f"    ... ({len(diff_output.split('\n')) - 20} more lines)")
            
            # Count lines
            local_lines = len(local_content.split('\n'))
            remote_lines = len(remote_content.split('\n'))
            print(f"  Local: {local_lines} lines")
            print(f"  Remote: {remote_lines} lines")
    
    print("\n=== Done ===")


if __name__ == '__main__':
    main()
