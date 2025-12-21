#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Metrics Tracking Script

Collects and reports key metrics from GitHub and other sources.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import requests
except ImportError:
    print("ERROR: requests library is required. Install with: pip install requests")
    sys.exit(1)


def get_github_metrics(repo: str, token: Optional[str] = None) -> Dict[str, Any]:
    """
    Get metrics from GitHub API.
    
    Collects comprehensive metrics from GitHub including:
    - Release downloads
    - Issue statistics
    - Repository statistics
    
    Args:
        repo: GitHub repository (format: "owner/repo")
        token: GitHub personal access token (optional for public repos)
    
    Returns:
        Dictionary containing collected metrics
    
    Raises:
        requests.RequestException: If API request fails
    """
    metrics: Dict[str, Any] = {}
    headers: Dict[str, str] = {}
    
    if token:
        headers["Authorization"] = f"token {token}"
    headers["Accept"] = "application/vnd.github.v3+json"
    
    try:
        # Get release downloads
        releases_url = f"https://api.github.com/repos/{repo}/releases"
        response = requests.get(releases_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            releases = response.json()
            total_downloads = sum(
                asset.get("download_count", 0)
                for release in releases
                for asset in release.get("assets", [])
            )
            metrics["total_downloads"] = total_downloads
            metrics["release_count"] = len(releases)
            metrics["latest_release"] = releases[0].get("tag_name") if releases else None
            
            # Get downloads per release
            release_downloads = []
            for release in releases[:10]:  # Last 10 releases
                release_dl = sum(
                    asset.get("download_count", 0)
                    for asset in release.get("assets", [])
                )
                release_downloads.append({
                    "version": release.get("tag_name"),
                    "downloads": release_dl,
                    "published_at": release.get("published_at")
                })
            metrics["release_downloads"] = release_downloads
        elif response.status_code == 404:
            # Repository not found or no releases
            metrics["total_downloads"] = 0
            metrics["release_count"] = 0
            metrics["latest_release"] = None
            metrics["release_downloads"] = []
        else:
            response.raise_for_status()
        
        # Get issue metrics
        issues_url = f"https://api.github.com/repos/{repo}/issues"
        response = requests.get(
            issues_url,
            headers=headers,
            params={"state": "all", "per_page": 100},
            timeout=10
        )
        
        if response.status_code == 200:
            issues = response.json()
            # Filter out pull requests (they have pull_request field)
            actual_issues = [i for i in issues if "pull_request" not in i]
            metrics["total_issues"] = len(actual_issues)
            metrics["open_issues"] = sum(1 for issue in actual_issues if issue.get("state") == "open")
            metrics["closed_issues"] = sum(1 for issue in actual_issues if issue.get("state") == "closed")
        elif response.status_code == 404:
            metrics["total_issues"] = 0
            metrics["open_issues"] = 0
            metrics["closed_issues"] = 0
        else:
            response.raise_for_status()
        
        # Get repository statistics
        repo_url = f"https://api.github.com/repos/{repo}"
        response = requests.get(repo_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            repo_data = response.json()
            metrics["stars"] = repo_data.get("stargazers_count", 0)
            metrics["forks"] = repo_data.get("forks_count", 0)
            metrics["watchers"] = repo_data.get("watchers_count", 0)
            metrics["open_issues_count"] = repo_data.get("open_issues_count", 0)
        elif response.status_code == 404:
            metrics["stars"] = 0
            metrics["forks"] = 0
            metrics["watchers"] = 0
            metrics["open_issues_count"] = 0
        else:
            response.raise_for_status()
        
    except requests.RequestException as e:
        print(f"ERROR: Failed to get GitHub metrics: {e}", file=sys.stderr)
        raise
    
    return metrics


def generate_metrics_report(metrics: Dict[str, Any], output_file: Path) -> None:
    """
    Generate metrics report.
    
    Args:
        metrics: Dictionary containing collected metrics
        output_file: Path to output file
    """
    report = {
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics,
        "summary": {
            "total_downloads": metrics.get("total_downloads", 0),
            "release_count": metrics.get("release_count", 0),
            "total_issues": metrics.get("total_issues", 0),
            "open_issues": metrics.get("open_issues", 0),
            "stars": metrics.get("stars", 0),
            "forks": metrics.get("forks", 0)
        }
    }
    
    # Create output directory if it doesn't exist
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)


def main() -> int:
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Track and report key metrics")
    parser.add_argument(
        "--repo",
        type=str,
        default="stuchain/CuePoint",
        help="GitHub repository (format: owner/repo)"
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="GitHub personal access token (or set GITHUB_TOKEN env var)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="metrics_report.json",
        help="Output file path"
    )
    
    args = parser.parse_args()
    
    # Get token from environment if not provided
    token = args.token or os.getenv("GITHUB_TOKEN")
    
    try:
        print(f"Collecting metrics for {args.repo}...")
        metrics = get_github_metrics(args.repo, token)
        
        output_path = Path(args.output)
        print(f"Generating metrics report: {output_path}")
        generate_metrics_report(metrics, output_path)
        
        print("\nMetrics Summary:")
        print(f"  Total Downloads: {metrics.get('total_downloads', 0)}")
        print(f"  Releases: {metrics.get('release_count', 0)}")
        print(f"  Total Issues: {metrics.get('total_issues', 0)}")
        print(f"  Open Issues: {metrics.get('open_issues', 0)}")
        print(f"  Stars: {metrics.get('stars', 0)}")
        print(f"  Forks: {metrics.get('forks', 0)}")
        print(f"\nReport saved to: {output_path}")
        
        return 0
        
    except requests.RequestException as e:
        print(f"ERROR: Failed to collect metrics: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

