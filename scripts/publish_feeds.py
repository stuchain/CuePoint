#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Publish update feeds to GitHub Pages.

This script updates appcast files in the gh-pages branch for GitHub Pages hosting.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


def run_command(cmd: list, cwd: Path = None) -> tuple:
    """
    Run a shell command.
    
    Args:
        cmd: Command and arguments as list
        cwd: Working directory
        
    Returns:
        Tuple of (returncode, stdout, stderr)
    """
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


def publish_feeds(
    appcast_files: list,
    branch: str = "gh-pages",
    message: str = "Update feeds",
    remote: str = "origin",
    github_token: Optional[str] = None
) -> bool:
    """
    Publish appcast files to GitHub Pages branch.
    
    Args:
        appcast_files: List of appcast file paths to publish
        branch: Branch name (default: gh-pages)
        message: Commit message
        remote: Remote name (default: origin)
        github_token: Optional GitHub token for authentication (for CI/CD)
        
    Returns:
        True if successful, False otherwise
    """
    repo_root = Path(__file__).parent.parent
    
    # Check if git is available
    returncode, _, _ = run_command(['git', '--version'])
    if returncode != 0:
        print("Error: git is not available", file=sys.stderr)
        return False
    
    # Check if we're in a git repository
    returncode, _, _ = run_command(['git', 'rev-parse', '--git-dir'], cwd=repo_root)
    if returncode != 0:
        print("Error: Not in a git repository", file=sys.stderr)
        return False
    
    # Configure git user (required for commits)
    # Use GitHub Actions bot identity if in CI, otherwise use defaults
    git_user_name = os.environ.get('GIT_AUTHOR_NAME', 'github-actions[bot]')
    git_user_email = os.environ.get('GIT_AUTHOR_EMAIL', 'github-actions[bot]@users.noreply.github.com')
    
    run_command(['git', 'config', 'user.name', git_user_name], cwd=repo_root)
    run_command(['git', 'config', 'user.email', git_user_email], cwd=repo_root)
    
    # Stash any uncommitted changes (e.g., version.py updates from sync)
    # We don't want to commit these to gh-pages branch
    # Also handle untracked files that might conflict with gh-pages branch
    returncode, stdout, _ = run_command(['git', 'status', '--porcelain'], cwd=repo_root)
    if stdout.strip():
        print("Stashing uncommitted changes before switching branches...")
        # Use -u to include untracked files, -a to include ignored files
        returncode, _, stderr = run_command(['git', 'stash', 'push', '-u', '-m', 'Temporary stash for gh-pages publish'], cwd=repo_root)
        if returncode != 0:
            print(f"Warning: Could not stash changes: {stderr}", file=sys.stderr)
            # If stash fails, try to remove untracked files that would conflict
            # Check what files would conflict
            returncode, conflict_files, _ = run_command(['git', 'clean', '-fdn'], cwd=repo_root)
            if conflict_files.strip():
                print("Removing untracked files that would conflict...")
                returncode, _, stderr = run_command(['git', 'clean', '-fd'], cwd=repo_root)
                if returncode != 0:
                    print(f"Warning: Could not clean untracked files: {stderr}", file=sys.stderr)
    
    # Fetch latest changes from remote (important for concurrent updates)
    print(f"Fetching latest changes from {remote}...")
    returncode, _, stderr = run_command(['git', 'fetch', remote], cwd=repo_root)
    if returncode != 0:
        print(f"Warning: Could not fetch from {remote}: {stderr}", file=sys.stderr)
        # Continue anyway - might be a new branch
    
    # Check if branch exists remotely
    returncode, _, _ = run_command(['git', 'ls-remote', '--heads', remote, branch], cwd=repo_root)
    branch_exists_remote = (returncode == 0)
    
    # Checkout or create gh-pages branch
    if branch_exists_remote:
        # Branch exists remotely - checkout and merge
        # First, ensure working directory is clean
        # Remove any untracked files that might conflict
        print(f"Cleaning working directory before checking out {branch}...")
        returncode, _, _ = run_command(['git', 'clean', '-fd'], cwd=repo_root)
        
        print(f"Branch {branch} exists remotely, checking out...")
        returncode, _, stderr = run_command(['git', 'checkout', '-B', branch, f'{remote}/{branch}'], cwd=repo_root)
        if returncode != 0:
            print(f"Error: Could not checkout branch {branch}: {stderr}", file=sys.stderr)
            # Try force checkout as last resort
            print("Attempting force checkout...")
            returncode, _, stderr = run_command(['git', 'checkout', '-f', '-B', branch, f'{remote}/{branch}'], cwd=repo_root)
            if returncode != 0:
                print(f"Error: Force checkout also failed: {stderr}", file=sys.stderr)
                return False
    else:
        # Branch doesn't exist remotely - check if it exists locally
        returncode, _, _ = run_command(['git', 'checkout', branch], cwd=repo_root)
        if returncode != 0:
            # Branch doesn't exist locally either, create it
            print(f"Creating new branch {branch}...")
            returncode, _, stderr = run_command(['git', 'checkout', '--orphan', branch], cwd=repo_root)
            if returncode != 0:
                print(f"Error: Could not create branch {branch}: {stderr}", file=sys.stderr)
                return False
            
            # Remove all files in orphan branch
            run_command(['git', 'rm', '-rf', '.'], cwd=repo_root)
    
    # Copy appcast files to repository
    for appcast_file in appcast_files:
        appcast_path = Path(appcast_file)
        if not appcast_path.exists():
            print(f"Warning: Appcast file not found: {appcast_file}", file=sys.stderr)
            continue
        
        # Make appcast_path absolute if it's relative
        if not appcast_path.is_absolute():
            appcast_path = repo_root / appcast_path
        
        # Determine destination path (preserve directory structure)
        # Expected input: updates/macos/stable/appcast.xml
        # Output in gh-pages: updates/macos/stable/appcast.xml
        if 'updates' in appcast_path.parts:
            # Find the 'updates' part and preserve everything after it
            updates_idx = appcast_path.parts.index('updates')
            relative_parts = appcast_path.parts[updates_idx:]
            dest_path = repo_root / Path(*relative_parts)
        elif appcast_path.parent.name in ['macos', 'windows']:
            # Fallback: preserve platform/channel structure
            dest_path = repo_root / 'updates' / appcast_path.parent.name / appcast_path.name
            if len(appcast_path.parent.parts) > 1 and appcast_path.parent.parts[-2] in ['stable', 'beta']:
                dest_path = repo_root / 'updates' / appcast_path.parent.parts[-2] / appcast_path.parent.name / appcast_path.name
        else:
            # Default: just copy to root (shouldn't happen)
            dest_path = repo_root / appcast_path.name
        
        # Normalize paths to handle any symlinks or relative path issues
        appcast_path = appcast_path.resolve()
        dest_path = dest_path.resolve()
        
        # Check if source and destination are the same file
        if appcast_path == dest_path:
            # Files are the same location - always add to git
            # Git will detect if there are actual changes
            run_command(['git', 'add', str(dest_path.relative_to(repo_root))], cwd=repo_root)
            print(f"File in place, added to git: {dest_path.relative_to(repo_root)}")
        else:
            # Different paths - copy file
            # Create destination directory
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Always copy (ensures file is up to date)
            import shutil
            shutil.copy2(appcast_path, dest_path)
            print(f"Copied: {appcast_path.relative_to(repo_root)} -> {dest_path.relative_to(repo_root)}")
            
            # Add to git
            run_command(['git', 'add', str(dest_path.relative_to(repo_root))], cwd=repo_root)
            print(f"Added to git: {dest_path.relative_to(repo_root)}")
    
    # Check if there are staged changes (files we just added)
    returncode, stdout, _ = run_command(['git', 'diff', '--cached', '--name-only'], cwd=repo_root)
    staged_files = stdout.strip()
    
    if not staged_files:
        # Check if files are untracked (new files)
        # Only add appcast files, ignore __pycache__, artifacts, etc.
        returncode, stdout, _ = run_command(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=repo_root)
        untracked = [line for line in stdout.strip().split('\n') if line.startswith('??')]
        if untracked:
            # Only add appcast/feed files, ignore everything else
            appcast_files = []
            for line in untracked:
                file_path = line[3:].strip()  # Remove '?? ' prefix
                # Only add files in updates/ directory (appcast files)
                if file_path.startswith('updates/') and (file_path.endswith('.xml') or 'appcast' in file_path.lower()):
                    appcast_files.append(file_path)
            
            if appcast_files:
                for file_path in appcast_files:
                    run_command(['git', 'add', file_path], cwd=repo_root)
                    print(f"Added untracked appcast file: {file_path}")
                # Re-check staged changes
                returncode, stdout, _ = run_command(['git', 'diff', '--cached', '--name-only'], cwd=repo_root)
                staged_files = stdout.strip()
            else:
                # No appcast files to add, ignore other untracked files
                print("Ignoring untracked files (not appcast files):")
                for line in untracked:
                    file_path = line[3:].strip()
                    print(f"  - {file_path}")
    
    if not staged_files:
        # Double-check by looking at git status for any changes
        returncode, stdout, _ = run_command(['git', 'status', '--porcelain'], cwd=repo_root)
        status_output = stdout.strip()
        if not status_output:
            print("No changes to commit - files are already up to date")
            print("Note: This can happen if:")
            print("  1. The appcast content is identical to what's already in gh-pages")
            print("  2. The version already exists with the same URLs and dates")
            print("  3. The pubDate hasn't changed (unlikely but possible)")
            return True
        else:
            # There are changes but not staged - try to add them
            # Only stage appcast files, ignore others
            print(f"Found unstaged changes, staging appcast files:")
            appcast_files_found = False
            for line in status_output.split('\n'):
                if line.strip():
                    # Extract file path (remove status prefix like ' M' or '??')
                    file_path = line[3:].strip() if len(line) > 3 else line.strip()
                    # Only add appcast/feed files
                    if file_path.startswith('updates/') and (file_path.endswith('.xml') or 'appcast' in file_path.lower()):
                        print(f"  Staging: {line}")
                        run_command(['git', 'add', file_path], cwd=repo_root)
                        appcast_files_found = True
                    else:
                        print(f"  Ignoring (not appcast): {line}")
            
            if appcast_files_found:
                # Re-check
                returncode, stdout, _ = run_command(['git', 'diff', '--cached', '--name-only'], cwd=repo_root)
                staged_files = stdout.strip()
                if not staged_files:
                    print("No changes to commit after staging")
                    return True
                else:
                    print(f"Staged files: {staged_files}")
            else:
                print("No appcast files found in unstaged changes")
                return True
    
    # Show what will be committed (for debugging)
    returncode, diff_output, _ = run_command(['git', 'diff', '--cached', '--stat'], cwd=repo_root)
    if diff_output.strip():
        print(f"Changes to be committed:")
        print(diff_output)
        
        # Show actual diff content for appcast files
        returncode, diff_content, _ = run_command(['git', 'diff', '--cached'], cwd=repo_root)
        if diff_content.strip():
            print(f"\nContent changes preview:")
            # Show first 1000 chars of diff
            preview = diff_content[:1000]
            print(preview)
            if len(diff_content) > 1000:
                print(f"... ({len(diff_content) - 1000} more characters)")
            
            # Count lines changed
            lines_added = diff_content.count('\n+') - diff_content.count('\n+++')
            lines_removed = diff_content.count('\n-') - diff_content.count('\n---')
            print(f"\nSummary: +{lines_added} lines, -{lines_removed} lines")
        else:
            print("WARNING: Files are staged but have no content differences!")
    else:
        # Check if files are actually different
        returncode, diff_content, _ = run_command(['git', 'diff', '--cached'], cwd=repo_root)
        if diff_content.strip():
            print(f"Content changes (no stat available):")
            # Show first 500 chars of diff
            print(diff_content[:500] + ("..." if len(diff_content) > 500 else ""))
        else:
            print("WARNING: No content changes detected in staged files!")
            print("This means the appcast files are identical to what's already in gh-pages.")
            print("This can happen if:")
            print("  1. The version already exists with identical content")
            print("  2. The pubDate is the same (unlikely but possible)")
            print("  3. All URLs and metadata are identical")
            print("\nChecking staged files...")
            returncode, staged_files, _ = run_command(['git', 'diff', '--cached', '--name-only'], cwd=repo_root)
            if staged_files.strip():
                print(f"Staged files: {staged_files}")
                print("These files are staged but have no differences from HEAD.")
                print("This likely means the content is identical.")
    
    # Commit changes
    print(f"Committing changes: {message}")
    returncode, stdout, stderr = run_command(
        ['git', 'commit', '-m', message],
        cwd=repo_root
    )
    if returncode != 0:
        error_msg = stderr.strip() or stdout.strip() or "Unknown error"
        print(f"Error: Could not commit changes: {error_msg}", file=sys.stderr)
        # Check if it's because there are no changes
        if "nothing to commit" in error_msg.lower() or "no changes" in error_msg.lower():
            print("No changes to commit - files are already up to date")
            print("This means the appcast content is identical to what's already committed.")
            # Show what's in the current appcast files for debugging
            for appcast_file in appcast_files:
                appcast_path = Path(appcast_file)
                if not appcast_path.is_absolute():
                    appcast_path = repo_root / appcast_path
                if appcast_path.exists():
                    # Show first few lines of the appcast
                    try:
                        content = appcast_path.read_text(encoding='utf-8')
                        lines = content.split('\n')[:10]
                        print(f"\nCurrent content of {appcast_path.name} (first 10 lines):")
                        for line in lines:
                            print(f"  {line}")
                    except Exception as e:
                        print(f"Could not read {appcast_path}: {e}")
            return True
        return False
    
    print(f"Committed changes: {message}")
    
    # Pull latest changes before pushing (handle concurrent updates)
    if branch_exists_remote:
        print(f"Pulling latest changes from {remote}/{branch}...")
        returncode, _, stderr = run_command(['git', 'pull', remote, branch, '--no-edit'], cwd=repo_root)
        if returncode != 0:
            # If pull fails, try rebase
            print(f"Pull failed, trying rebase: {stderr}", file=sys.stderr)
            returncode, _, stderr = run_command(['git', 'pull', '--rebase', remote, branch], cwd=repo_root)
            if returncode != 0:
                print(f"Warning: Could not pull/rebase from {remote}/{branch}: {stderr}", file=sys.stderr)
                print("Attempting to push anyway (may fail if conflicts exist)...")
    
    # Push to remote (with authentication if token provided)
    push_cmd = ['git', 'push', remote, branch]
    
    # If GitHub token provided, use it for authentication
    if github_token:
        # Get current remote URL
        returncode, remote_url_output, _ = run_command(['git', 'remote', 'get-url', remote], cwd=repo_root)
        if returncode == 0:
            remote_url = remote_url_output.strip()
            
            # Configure remote URL with token for HTTPS
            if remote_url.startswith('https://github.com/') or remote_url.startswith('https://www.github.com/'):
                # Extract repo path (e.g., owner/repo.git)
                repo_path = remote_url.replace('https://github.com/', '').replace('https://www.github.com/', '').replace('.git', '')
                auth_url = f'https://{github_token}@github.com/{repo_path}.git'
                
                # Temporarily set remote URL with token
                run_command(['git', 'remote', 'set-url', remote, auth_url], cwd=repo_root)
    
    returncode, _, stderr = run_command(push_cmd, cwd=repo_root)
    
    # Restore original remote URL if we modified it
    if github_token and 'remote_url' in locals():
        run_command(['git', 'remote', 'set-url', remote, remote_url], cwd=repo_root)
    
    if returncode != 0:
        print(f"Error: Could not push to {remote}/{branch}: {stderr}", file=sys.stderr)
        print("Note: You may need to push manually or check authentication")
        return False
    
    print(f"Pushed to {remote}/{branch}")
    return True


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description='Publish update feeds to GitHub Pages'
    )
    parser.add_argument(
        'appcasts',
        nargs='+',
        help='Appcast files to publish'
    )
    parser.add_argument(
        '--branch',
        default='gh-pages',
        help='Branch name (default: gh-pages)'
    )
    parser.add_argument(
        '--message',
        default='Update feeds',
        help='Commit message (default: Update feeds)'
    )
    parser.add_argument(
        '--remote',
        default='origin',
        help='Remote name (default: origin)'
    )
    parser.add_argument(
        '--github-token',
        help='GitHub token for authentication (for CI/CD)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without making changes'
    )
    
    args = parser.parse_args()
    
    # Get token from environment if not provided (for CI/CD)
    github_token = args.github_token or os.environ.get('GITHUB_TOKEN')
    
    if args.dry_run:
        print("Dry run mode - no changes will be made")
        for appcast in args.appcasts:
            appcast_path = Path(appcast)
            if appcast_path.exists():
                print(f"Would publish: {appcast}")
            else:
                print(f"Warning: File not found: {appcast}")
        return 0
    
    success = publish_feeds(
        args.appcasts,
        args.branch,
        args.message,
        args.remote,
        github_token
    )
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
