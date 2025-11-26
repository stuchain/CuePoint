#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Direct Beatport search implementation - multiple methods

This module provides alternative search methods to DuckDuckGo:
1. Direct HTML scraping: Parses Beatport search pages directly
2. API endpoint discovery: Uses Beatport's internal API endpoints
3. Browser automation: Uses Playwright/Selenium as fallback for JS-rendered content

Why multiple methods?
- DuckDuckGo can miss remixes that appear later in Beatport's own search
- Direct search is more reliable for specific remix queries
- Browser automation finds JavaScript-rendered tracks that static scraping misses

Key functions:
- beatport_search_via_api(): Searches using Beatport's API
- beatport_search_via_html(): Searches by parsing HTML
- beatport_search_via_browser(): Searches using browser automation
"""

import json
import re
import time
import random
from typing import List, Optional, Dict, Any
from urllib.parse import quote_plus

from bs4 import BeautifulSoup

from cuepoint.models.config import BASE_URL, SESSION, SETTINGS
from cuepoint.data.beatport import is_track_url, request_html
from cuepoint.utils.utils import vlog


def _extract_track_ids_from_next_data(data: Any, seen: set, urls: List[str], max_results: int) -> None:
    """Recursively extract track URLs from Next.js __NEXT_DATA__ structure"""
    # First, try common Next.js patterns
    if isinstance(data, dict):
        # Pattern 1: props.pageProps.dehydratedState.queries (React Query)
        page_props = data.get("props", {})
        if isinstance(page_props, dict):
            dehydrated = page_props.get("pageProps", {}).get("dehydratedState", {})
            if isinstance(dehydrated, dict):
                queries = dehydrated.get("queries", [])
                for q in queries if isinstance(queries, list) else []:
                    if isinstance(q, dict):
                        state = q.get("state", {})
                        if isinstance(state, dict):
                            data_val = state.get("data", {})
                            if isinstance(data_val, dict):
                                                # Look for tracks array or direct track objects
                                tracks = data_val.get("tracks") or data_val.get("results") or data_val.get("items") or []
                                # Also check if data_val itself is a list of tracks
                                if isinstance(data_val, list):
                                    tracks = data_val
                                if isinstance(tracks, list):
                                    for track in tracks:
                                        if isinstance(track, dict):
                                            track_id = track.get("id")
                                            slug = track.get("slug")
                                            # Also check for slug in various formats
                                            if not slug:
                                                slug = track.get("name") or track.get("title")
                                                # Try to extract slug from URL if present
                                                track_url = track.get("url") or track.get("href") or track.get("link")
                                                if track_url and "/track/" in track_url:
                                                    slug_match = re.search(r'/track/([^/]+)/', track_url)
                                                    if slug_match:
                                                        slug = slug_match.group(1)
                                            
                                            if track_id and slug:
                                                url = f"{BASE_URL}/track/{slug}/{track_id}"
                                                if is_track_url(url) and url not in seen:
                                                    seen.add(url)
                                                    urls.append(url)
                                                    if len(urls) >= max_results:
                                                        return
                                            
                                            # Also check if track has a direct URL field
                                            for url_field in ["url", "href", "link", "canonical_url", "web_url"]:
                                                if url_field in track:
                                                    track_url = track[url_field]
                                                    if isinstance(track_url, str) and "beatport.com/track/" in track_url:
                                                        if is_track_url(track_url) and track_url not in seen:
                                                            seen.add(track_url)
                                                            urls.append(track_url)
                                                            if len(urls) >= max_results:
                                                                return
                        
                        # Also check queryKey and queryHash for direct data
                        query_data = state.get("data") if isinstance(state, dict) else None
                        if isinstance(query_data, list):
                            for item in query_data:
                                if isinstance(item, dict):
                                    track_id = item.get("id")
                                    slug = item.get("slug")
                                    if track_id and slug:
                                        url = f"{BASE_URL}/track/{slug}/{track_id}"
                                        if is_track_url(url) and url not in seen:
                                            seen.add(url)
                                            urls.append(url)
                                            if len(urls) >= max_results:
                                                return
    
    # Fallback: General recursive traversal
    def traverse(obj, depth=0, path=""):
        if depth > 25 or len(urls) >= max_results:
            return
        
        if isinstance(obj, dict):
            # Look for track objects - they often have id, slug, or url fields
            if "id" in obj and "slug" in obj:
                track_id = obj.get("id")
                slug = obj.get("slug")
                # Make sure it's a numeric ID (track IDs are numeric)
                if track_id and slug and isinstance(track_id, (int, str)) and str(track_id).isdigit():
                    # Construct URL
                    url = f"{BASE_URL}/track/{slug}/{track_id}"
                    if is_track_url(url) and url not in seen:
                        seen.add(url)
                        urls.append(url)
                        if len(urls) >= max_results:
                            return
            
            # Also check for direct URL fields
            for key in ["url", "href", "link", "canonical_url", "web_url", "trackUrl", "slug"]:
                if key in obj:
                    val = obj[key]
                    if isinstance(val, str):
                        if "beatport.com/track/" in val:
                            if is_track_url(val) and val not in seen:
                                seen.add(val)
                                urls.append(val)
                                if len(urls) >= max_results:
                                    return
                        elif key == "slug" and "id" in obj:
                            # Construct from slug + id
                            track_id = obj.get("id")
                            if track_id:
                                url = f"{BASE_URL}/track/{val}/{track_id}"
                                if is_track_url(url) and url not in seen:
                                    seen.add(url)
                                    urls.append(url)
                                    if len(urls) >= max_results:
                                        return
            
            # Recurse into all values
            for k, v in obj.items():
                traverse(v, depth + 1, f"{path}.{k}" if path else k)
                
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                traverse(item, depth + 1, f"{path}[{i}]" if path else f"[{i}]")
    
    # Run traversal
    traverse(data)


def beatport_search_via_api(idx: int, query: str, max_results: int = 50) -> List[str]:
    """
    Attempt to use Beatport's API endpoints directly.
    This tries common API patterns used by Beatport.
    """
    urls: List[str] = []
    
    # Common API endpoint patterns to try
    api_endpoints = [
        f"{BASE_URL}/api/search/tracks?q={quote_plus(query)}",
        f"{BASE_URL}/api/v4/search?query={quote_plus(query)}&type=track",
        f"{BASE_URL}/api/tracks/search?q={quote_plus(query)}",
        f"{BASE_URL}/_next/data/undefined/search.json?q={quote_plus(query)}",
    ]
    
    for endpoint in api_endpoints:
        try:
            resp = SESSION.get(endpoint, timeout=SETTINGS["READ_TIMEOUT"])
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    seen = set()
                    _extract_track_ids_from_next_data(data, seen, urls, max_results)
                    if urls:
                        vlog(idx, f"[beatport-api] Found {len(urls)} tracks via API: {endpoint}")
                        return urls[:max_results]
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            vlog(idx, f"[beatport-api] Error trying {endpoint}: {e!r}")
            continue
    
    return []


def beatport_search_direct(idx: int, query: str, max_results: int = 50) -> List[str]:
    """
    Search Beatport directly by scraping their search results page.
    This bypasses DuckDuckGo entirely and gets results directly from Beatport.
    
    Args:
        idx: Track index for logging
        query: Search query (e.g., "Never Sleep Again (Keinemusik Remix)")
        max_results: Maximum number of results to return
        
    Returns:
        List of Beatport track URLs
    """
    urls: List[str] = []
    seen = set()
    
    try:
        # First, try API endpoints
        api_urls = beatport_search_via_api(idx, query, max_results)
        if api_urls:
            return api_urls
        
        # Beatport search URL format
        # Remove all quote marks (single, double, triple) from query for URL encoding
        clean_query = query.strip('"').strip("'").strip()
        # Remove any remaining quote marks in the middle
        clean_query = clean_query.replace('"""', '').replace('"', '').replace("'", '')
        encoded_query = quote_plus(clean_query)
        search_url = f"{BASE_URL}/search?q={encoded_query}"
        
        vlog(idx, f"[beatport-direct] Searching: {search_url}")
        
        # Fetch the search page
        soup = request_html(search_url)
        if not soup:
            vlog(idx, f"[beatport-direct] Failed to fetch search page")
            return []
        
        # Method 1: Look for track links directly in HTML
        for link in soup.select('a[href^="/track/"]'):
            href = link.get("href", "")
            if not href:
                continue
            
            full_url = f"{BASE_URL}{href}" if href.startswith("/track/") else href
            
            if is_track_url(full_url) and full_url not in seen:
                seen.add(full_url)
                urls.append(full_url)
                if len(urls) >= max_results:
                    break
        
        # Method 2: Parse __NEXT_DATA__ (Next.js app - main method for JS-rendered pages)
        next_data_script = soup.find("script", id="__NEXT_DATA__")
        if next_data_script:
            try:
                data = json.loads(next_data_script.string or "")
                
                # Extract tracks from Next.js data structure
                # Tracks are typically in props.pageProps.dehydratedState.queries or similar
                _extract_track_ids_from_next_data(data, seen, urls, max_results)
                
            except Exception as e:
                vlog(idx, f"[beatport-direct] Error parsing __NEXT_DATA__: {e!r}")
        
        # Method 3: Look for track IDs in script tags (regex fallback)
        for script in soup.find_all("script"):
            if script.string:
                # Find track URLs in script content
                matches = re.findall(r'(https?://[^"\s]+beatport\.com/track/[^"\s]+/\d+)', script.string)
                for match in matches:
                    if is_track_url(match) and match not in seen:
                        seen.add(match)
                        urls.append(match)
                        if len(urls) >= max_results:
                            break
                
                # Also look for relative paths like "/track/title/123"
                relative_matches = re.findall(r'("?/track/[^"\s]+/\d+)"?', script.string)
                for match in relative_matches:
                    clean_match = match.strip('"\'')
                    if clean_match.startswith("/track/"):
                        full_url = f"{BASE_URL}{clean_match}"
                        if is_track_url(full_url) and full_url not in seen:
                            seen.add(full_url)
                            urls.append(full_url)
                            if len(urls) >= max_results:
                                break
        
        # Method 4: Look for track URLs in data attributes
        for element in soup.find_all(attrs={"data-track-id": True}):
            track_id = element.get("data-track-id")
            track_slug = element.get("data-track-slug") or element.get("href", "").replace("/track/", "").split("/")[0]
            if track_id and track_slug:
                url = f"{BASE_URL}/track/{track_slug}/{track_id}"
                if is_track_url(url) and url not in seen:
                    seen.add(url)
                    urls.append(url)
                    if len(urls) >= max_results:
                        break
        
        # Add small delay to be respectful
        time.sleep(random.uniform(0.1, 0.3))
        
        vlog(idx, f"[beatport-direct] Found {len(urls)} track URLs")
        
    except Exception as e:
        vlog(idx, f"[beatport-direct] Error: {e!r}")
    
    return urls[:max_results] if max_results else urls


def beatport_search_browser(idx: int, query: str, max_results: int = 50) -> List[str]:
    """
    Use browser automation (Selenium or Playwright) to search Beatport.
    This is the most reliable method as it fully renders JavaScript content.
    
    Args:
        idx: Track index for logging
        query: Search query
        max_results: Maximum results
        
    Returns:
        List of Beatport track URLs
    """
    urls: List[str] = []
    
    # Try Playwright first (faster, more modern)
    try:
        from playwright.sync_api import sync_playwright
        
        vlog(idx, f"[beatport-browser] Using Playwright to search: {query}")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Navigate to search page
            # Remove all quote marks (single, double, triple) from query for URL encoding
            clean_query = query.strip('"').strip("'").strip()
            # Remove any remaining quote marks in the middle
            clean_query = clean_query.replace('"""', '').replace('"', '').replace("'", '')
            encoded_query = quote_plus(clean_query)
            search_url = f"{BASE_URL}/search?q={encoded_query}"
            
            page.goto(search_url, wait_until="networkidle", timeout=30000)
            
            # Wait for track links to appear
            try:
                page.wait_for_selector('a[href^="/track/"]', timeout=10000)
            except:
                pass  # Links might already be there
            
            # Extract all track links
            seen = set()
            for link in page.query_selector_all('a[href^="/track/"]'):
                href = link.get_attribute('href')
                if href:
                    full_url = f"{BASE_URL}{href}" if href.startswith("/track/") else href
                    if is_track_url(full_url) and full_url not in seen:
                        seen.add(full_url)
                        urls.append(full_url)
                        if len(urls) >= max_results:
                            break
            
            browser.close()
            
            if urls:
                vlog(idx, f"[beatport-browser] Found {len(urls)} tracks via Playwright")
                return urls[:max_results]
                
    except ImportError:
        # Playwright not available, try Selenium
        pass
    except Exception as e:
        vlog(idx, f"[beatport-browser] Playwright error: {e!r}, trying Selenium")
    
    # Fallback to Selenium
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.options import Options
        
        vlog(idx, f"[beatport-browser] Using Selenium to search: {query}")
        
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument(f'user-agent={SETTINGS.get("USER_AGENT", "Mozilla/5.0")}')
        
        driver = webdriver.Chrome(options=options)
        
        try:
            # Remove all quote marks (single, double, triple) from query for URL encoding
            clean_query = query.strip('"').strip("'").strip()
            # Remove any remaining quote marks in the middle
            clean_query = clean_query.replace('"""', '').replace('"', '').replace("'", '')
            encoded_query = quote_plus(clean_query)
            search_url = f"{BASE_URL}/search?q={encoded_query}"
            
            driver.get(search_url)
            
            # Wait for track links
            try:
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 'a[href^="/track/"]'))
                )
            except:
                pass
            
            # Extract track links
            seen = set()
            links = driver.find_elements(By.CSS_SELECTOR, 'a[href^="/track/"]')
            for link in links:
                href = link.get_attribute('href')
                if href:
                    full_url = href if href.startswith('http') else f"{BASE_URL}{href}"
                    if is_track_url(full_url) and full_url not in seen:
                        seen.add(full_url)
                        urls.append(full_url)
                        if len(urls) >= max_results:
                            break
            
            if urls:
                vlog(idx, f"[beatport-browser] Found {len(urls)} tracks via Selenium")
                
        finally:
            driver.quit()
            
    except ImportError:
        vlog(idx, f"[beatport-browser] Selenium not available - install with: pip install selenium")
    except Exception as e:
        vlog(idx, f"[beatport-browser] Selenium error: {e!r}")
    
    return urls[:max_results]


def beatport_search_hybrid(idx: int, query: str, max_results: int = 50, prefer_direct: bool = True) -> List[str]:
    """
    Hybrid search: Try direct Beatport search first, fall back to DuckDuckGo if needed.
    
    Args:
        idx: Track index for logging
        query: Search query
        max_results: Maximum results
        prefer_direct: If True, use direct search first; if False, try DuckDuckGo first
        
    Returns:
        List of unique Beatport track URLs
    """
    from beatport import ddg_track_urls
    
    seen = set()
    urls = []
    
    if prefer_direct:
        # Try direct Beatport search first
        direct_urls = beatport_search_direct(idx, query, max_results)
        for url in direct_urls:
            if url not in seen:
                seen.add(url)
                urls.append(url)
        
        # If we got good results, return early
        if len(urls) >= max_results * 0.7:  # If we got 70% of what we wanted
            return urls[:max_results]
        
        # Otherwise, supplement with DuckDuckGo
        ddg_urls = ddg_track_urls(idx, query, max(max_results - len(urls), 20))
        for url in ddg_urls:
            if url not in seen:
                seen.add(url)
                urls.append(url)
    else:
        # Try DuckDuckGo first, then supplement with direct search
        ddg_urls = ddg_track_urls(idx, query, max_results)
        for url in ddg_urls:
            if url not in seen:
                seen.add(url)
                urls.append(url)
        
        if len(urls) < max_results * 0.5:  # If DuckDuckGo found less than 50%
            direct_urls = beatport_search_direct(idx, query, max(max_results - len(urls), 20))
            for url in direct_urls:
                if url not in seen:
                    seen.add(url)
                    urls.append(url)
    
    return urls[:max_results]

