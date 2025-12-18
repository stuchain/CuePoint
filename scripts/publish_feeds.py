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
    returncode, stdout, _ = run_command(['git', 'status', '--porcelain'], cwd=repo_root)
    if stdout.strip():
        print("Stashing uncommitted changes before switching branches...")
        returncode, _, stderr = run_command(['git', 'stash', 'push', '-m', 'Temporary stash for gh-pages publish'], cwd=repo_root)
        if returncode != 0:
            print(f"Warning: Could not stash changes: {stderr}", file=sys.stderr)
            # Try to continue anyway
    
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
        print(f"Branch {branch} exists remotely, checking out...")
        returncode, _, stderr = run_command(['git', 'checkout', '-B', branch, f'{remote}/{branch}'], cwd=repo_root)
        if returncode != 0:
            print(f"Error: Could not checkout branch {branch}: {stderr}", file=sys.stderr)
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
            # Files are the same - just add to git without copying
            print(f"File already in place: {dest_path.relative_to(repo_root)}")
        else:
            # Create destination directory
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file
            import shutil
            shutil.copy2(appcast_path, dest_path)
            print(f"Copied: {appcast_path.relative_to(repo_root)} -> {dest_path.relative_to(repo_root)}")
        
        # Add to git
        run_command(['git', 'add', str(dest_path.relative_to(repo_root))], cwd=repo_root)
        print(f"Added to git: {dest_path.relative_to(repo_root)}")
    
    # Check if there are changes
    returncode, stdout, _ = run_command(['git', 'status', '--porcelain'], cwd=repo_root)
    if not stdout.strip():
        print("No changes to commit")
        return True
    
    # Commit changes
    returncode, _, stderr = run_command(
        ['git', 'commit', '-m', message],
        cwd=repo_root
    )
    if returncode != 0:
        print(f"Error: Could not commit changes: {stderr}", file=sys.stderr)
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
