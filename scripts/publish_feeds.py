#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Publish the static GitHub Pages site (landing page) to the gh-pages branch.

Run by .github/workflows/publish-gh-pages-site.yml:

    python scripts/publish_feeds.py --site-only --branch gh-pages --message "..." \
        --github-token "$GITHUB_TOKEN" --index gh-pages-root/index.html

It copies index.html, logo.png, robots.txt and sitemap.xml (whichever exist) from the
directory of the --index file to the root of the gh-pages branch, commits them and pushes.
Everything else already on gh-pages is left unchanged. The file keeps its old name; the
update-feed (appcast) publishing it used to do was removed in Phase 12.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

SITE_STATIC_TEXT = ("robots.txt", "sitemap.xml")


def run_command(cmd: list, cwd: Optional[Path] = None) -> Tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, check=False
        )
        return (result.returncode, result.stdout, result.stderr)
    except Exception as e:
        return (1, "", str(e))


def _staged_files(repo_root: Path) -> str:
    _, stdout, _ = run_command(["git", "diff", "--cached", "--name-only"], cwd=repo_root)
    return stdout.strip()


def publish_site(
    index_path: str,
    branch: str = "gh-pages",
    message: str = "Update site",
    remote: str = "origin",
    github_token: Optional[str] = None,
) -> bool:
    """
    Publish the site files next to ``index_path`` to the ``branch`` branch.

    Args:
        index_path: Path to index.html for the Pages root (e.g. gh-pages-root/index.html);
            logo.png, robots.txt and sitemap.xml are taken from the same directory.
        branch: Branch name (default: gh-pages)
        message: Commit message
        remote: Remote name (default: origin)
        github_token: Optional GitHub token for authentication (for CI/CD)

    Returns:
        True if successful (including "nothing to commit"), False otherwise
    """
    repo_root = Path(__file__).parent.parent

    returncode, _, _ = run_command(["git", "--version"])
    if returncode != 0:
        print("Error: git is not available", file=sys.stderr)
        return False

    returncode, _, _ = run_command(["git", "rev-parse", "--git-dir"], cwd=repo_root)
    if returncode != 0:
        print("Error: Not in a git repository", file=sys.stderr)
        return False

    # Commits need an identity: use the GitHub Actions bot unless the environment sets one.
    git_user_name = os.environ.get("GIT_AUTHOR_NAME", "github-actions[bot]")
    git_user_email = os.environ.get(
        "GIT_AUTHOR_EMAIL", "github-actions[bot]@users.noreply.github.com"
    )
    run_command(["git", "config", "user.name", git_user_name], cwd=repo_root)
    run_command(["git", "config", "user.email", git_user_email], cwd=repo_root)

    # Save the site files BEFORE checking out gh-pages: the checkout replaces the working tree.
    print("Saving site files before branch checkout...")
    index_file = Path(index_path)
    if not index_file.is_absolute():
        index_file = repo_root / index_file
    if not index_file.exists():
        print(f"Error: Index file not found: {index_path}", file=sys.stderr)
        return False
    saved_index_content = index_file.read_text(encoding="utf-8")
    print(f"  Saved index: {index_file} ({len(saved_index_content)} bytes)")
    saved_logo_bytes: Optional[bytes] = None
    logo_file = index_file.parent / "logo.png"
    if logo_file.exists():
        saved_logo_bytes = logo_file.read_bytes()
        print(f"  Saved logo: {logo_file} ({len(saved_logo_bytes)} bytes)")
    saved_text: Dict[str, str] = {}
    for static_name in SITE_STATIC_TEXT:
        static_path = index_file.parent / static_name
        if static_path.exists():
            saved_text[static_name] = static_path.read_text(encoding="utf-8")
            print(f"  Saved {static_name}: {static_path} ({len(saved_text[static_name])} bytes)")

    # Stash uncommitted changes so they are not committed to gh-pages and cannot block the checkout.
    _, stdout, _ = run_command(["git", "status", "--porcelain"], cwd=repo_root)
    if stdout.strip():
        print("Stashing uncommitted changes before switching branches...")
        returncode, _, stderr = run_command(
            ["git", "stash", "push", "-u", "-m", "Temporary stash for gh-pages publish"],
            cwd=repo_root,
        )
        if returncode != 0:
            print(f"Warning: Could not stash changes: {stderr}", file=sys.stderr)
            _, conflict_files, _ = run_command(["git", "clean", "-fdn"], cwd=repo_root)
            if conflict_files.strip():
                print("Removing untracked files that would conflict...")
                returncode, _, stderr = run_command(["git", "clean", "-fd"], cwd=repo_root)
                if returncode != 0:
                    print(f"Warning: Could not clean untracked files: {stderr}", file=sys.stderr)

    print(f"Fetching latest changes from {remote}...")
    returncode, _, stderr = run_command(["git", "fetch", remote], cwd=repo_root)
    if returncode != 0:
        print(f"Warning: Could not fetch from {remote}: {stderr}", file=sys.stderr)
        # Continue anyway - the branch might be new.

    # `git ls-remote` exits 0 whether or not the branch exists; an empty answer means absent.
    returncode, stdout, _ = run_command(["git", "ls-remote", "--heads", remote, branch], cwd=repo_root)
    branch_exists_remote = returncode == 0 and bool(stdout.strip())

    if branch_exists_remote:
        print(f"Cleaning working directory before checking out {branch}...")
        run_command(["git", "clean", "-fd"], cwd=repo_root)
        print(f"Branch {branch} exists remotely, checking out...")
        returncode, _, stderr = run_command(
            ["git", "checkout", "-B", branch, f"{remote}/{branch}"], cwd=repo_root
        )
        if returncode != 0:
            print(f"Error: Could not checkout branch {branch}: {stderr}", file=sys.stderr)
            print("Attempting force checkout...")
            returncode, _, stderr = run_command(
                ["git", "checkout", "-f", "-B", branch, f"{remote}/{branch}"], cwd=repo_root
            )
            if returncode != 0:
                print(f"Error: Force checkout also failed: {stderr}", file=sys.stderr)
                return False
    else:
        returncode, _, _ = run_command(["git", "checkout", branch], cwd=repo_root)
        if returncode != 0:
            print(f"Creating new branch {branch}...")
            returncode, _, stderr = run_command(["git", "checkout", "--orphan", branch], cwd=repo_root)
            if returncode != 0:
                print(f"Error: Could not create branch {branch}: {stderr}", file=sys.stderr)
                return False
            run_command(["git", "rm", "-rf", "."], cwd=repo_root)

    # Write the saved site files to the branch root and stage them.
    print("Restoring site files after branch checkout...")
    (repo_root / "index.html").write_text(saved_index_content, encoding="utf-8")
    run_command(["git", "add", "index.html"], cwd=repo_root)
    print("  Added index.html to git")
    if saved_logo_bytes is not None:
        (repo_root / "logo.png").write_bytes(saved_logo_bytes)
        run_command(["git", "add", "logo.png"], cwd=repo_root)
        print("  Added logo.png to git")
    for static_name, static_content in saved_text.items():
        (repo_root / static_name).write_text(static_content, encoding="utf-8")
        run_command(["git", "add", static_name], cwd=repo_root)
        print(f"  Added {static_name} to git")

    staged_files = _staged_files(repo_root)
    if not staged_files:
        print("No changes to commit - the site on the branch is already up to date")
        return True

    _, diff_output, _ = run_command(["git", "diff", "--cached", "--stat"], cwd=repo_root)
    print("Changes to be committed:")
    print(diff_output)

    print(f"Committing changes: {message}")
    returncode, stdout, stderr = run_command(["git", "commit", "-m", message], cwd=repo_root)
    if returncode != 0:
        error_msg = stderr.strip() or stdout.strip() or "Unknown error"
        print(f"Error: Could not commit changes: {error_msg}", file=sys.stderr)
        if "nothing to commit" in error_msg.lower() or "no changes" in error_msg.lower():
            print("No changes to commit - the site on the branch is already up to date")
            return True
        return False
    print(f"Committed changes: {message}")

    # Pull latest changes before pushing (handle concurrent updates).
    if branch_exists_remote:
        print(f"Pulling latest changes from {remote}/{branch}...")
        returncode, _, stderr = run_command(["git", "pull", remote, branch, "--no-edit"], cwd=repo_root)
        if returncode != 0:
            print(f"Pull failed, trying rebase: {stderr}", file=sys.stderr)
            returncode, _, stderr = run_command(["git", "pull", "--rebase", remote, branch], cwd=repo_root)
            if returncode != 0:
                print(f"Warning: Could not pull/rebase from {remote}/{branch}: {stderr}", file=sys.stderr)
                print("Attempting to push anyway (may fail if conflicts exist)...")

    # Push, authenticating with the token when one is given (HTTPS GitHub remotes only).
    remote_url: Optional[str] = None
    if github_token:
        returncode, remote_url_output, _ = run_command(["git", "remote", "get-url", remote], cwd=repo_root)
        if returncode == 0:
            url = remote_url_output.strip()
            if url.startswith("https://github.com/") or url.startswith("https://www.github.com/"):
                remote_url = url
                repo_path = url.replace("https://github.com/", "").replace("https://www.github.com/", "").replace(".git", "")
                auth_url = f"https://{github_token}@github.com/{repo_path}.git"
                run_command(["git", "remote", "set-url", remote, auth_url], cwd=repo_root)

    returncode, _, stderr = run_command(["git", "push", remote, branch], cwd=repo_root)

    # Restore the original remote URL if we put the token in it.
    if remote_url is not None:
        run_command(["git", "remote", "set-url", remote, remote_url], cwd=repo_root)

    if returncode != 0:
        print(f"Error: Could not push to {remote}/{branch}: {stderr}", file=sys.stderr)
        print("Note: You may need to push manually or check authentication")
        return False

    print(f"Pushed to {remote}/{branch}")
    return True


def main() -> int:
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Publish the static site (index.html, logo.png, robots.txt, sitemap.xml) to GitHub Pages"
    )
    parser.add_argument(
        "--site-only",
        action="store_true",
        help="Kept for the workflow; the script only publishes the site now, so this changes nothing",
    )
    parser.add_argument("--branch", default="gh-pages", help="Branch name (default: gh-pages)")
    parser.add_argument(
        "--message", default="Update site", help="Commit message (default: Update site)"
    )
    parser.add_argument("--remote", default="origin", help="Remote name (default: origin)")
    parser.add_argument("--github-token", help="GitHub token for authentication (for CI/CD)")
    parser.add_argument(
        "--index",
        metavar="PATH",
        required=True,
        help="Path to index.html to publish at the Pages root (e.g. gh-pages-root/index.html)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    args = parser.parse_args()

    # Get token from environment if not provided (for CI/CD)
    github_token = args.github_token or os.environ.get("GITHUB_TOKEN")

    if args.dry_run:
        print("Dry run mode - no changes will be made")
        print(f"Would publish the site from {args.index} to {args.remote}/{args.branch}")
        return 0

    success = publish_site(args.index, args.branch, args.message, args.remote, github_token)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
