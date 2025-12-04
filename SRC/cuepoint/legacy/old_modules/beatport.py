#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport scraping and parsing utilities

This module handles:
1. Fetching Beatport track URLs via DuckDuckGo search
2. Parsing Beatport track pages to extract metadata
3. Handling HTTP errors and retries
4. Extracting structured data (JSON-LD, HTML)

Key functions:
- track_urls(): Finds Beatport track URLs via DuckDuckGo search
- parse_track_page(): Parses a single Beatport track page
- request_html(): Robust HTTP fetching with retry logic
- _parse_structured_json_ld(): Extracts structured data from pages
"""

import json
import random
import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser
from ddgs import DDGS

from config import BASE_URL, SESSION, SETTINGS
from mix_parser import _extract_remixer_names_from_title, _merge_name_lists, _split_display_names
from utils import vlog, retry_with_backoff

# Cache hit tracking for performance metrics
_last_cache_hit = False


@dataclass
class BeatportCandidate:
    """
    Represents a Beatport track candidate with all metadata
    
    This dataclass stores all information about a candidate track:
    - Basic info: URL, title, artists
    - Musical metadata: Key, year, BPM
    - Release info: Label, genres, release name/date
    - Scoring info: Similarity scores, bonuses, guard status
    - Search info: Which query found it, candidate index
    """
    url: str
    title: str
    artists: str
    key: Optional[str]
    release_year: Optional[int]
    bpm: Optional[str]
    label: Optional[str]
    genres: Optional[str]
    release_name: Optional[str]
    release_date: Optional[str]
    score: float
    title_sim: int
    artist_sim: int
    query_index: int
    query_text: str
    candidate_index: int
    base_score: float
    bonus_year: int
    bonus_key: int
    guard_ok: bool
    reject_reason: str
    elapsed_ms: int
    is_winner: bool


def is_track_url(u: str) -> bool:
    """Check if URL is a Beatport track URL"""
    return bool(re.search(r"beatport\.com/track/[^/]+/\d+", u))


def get_last_cache_hit() -> bool:
    """Get the cache hit status from the last request_html() call"""
    return _last_cache_hit


@retry_with_backoff(
    max_retries=3,
    backoff_base=1.0,
    backoff_max=30.0,
    jitter=True
)
def request_html(url: str) -> Optional[BeautifulSoup]:
    """Fetch a URL robustly, handling empty gzipped/brotli responses by retrying without compression."""
    global _last_cache_hit
    to = (SETTINGS["CONNECT_TIMEOUT"], SETTINGS["READ_TIMEOUT"])

    def _is_empty_body(resp: requests.Response) -> bool:
        if resp is None:
            return True
        if resp.status_code in (204, 304):
            return True
        try:
            clen = resp.headers.get("Content-Length")
        except Exception:
            clen = None
        enc = (resp.headers.get("Content-Encoding") or "").lower()
        if resp.content:
            return len(resp.content) == 0
        if clen and clen.isdigit() and int(clen) == 0:
            return True
        if any(x in enc for x in ("gzip", "br", "deflate")):
            return True
        return False

    def _get(u: str, headers: Optional[dict] = None) -> Optional[requests.Response]:
        try:
            resp = SESSION.get(u, timeout=to, allow_redirects=True, headers=headers)
            # Track cache hit status for performance metrics
            if resp:
                # Check if response came from cache (requests_cache adds this attribute)
                if hasattr(resp, 'from_cache'):
                    _last_cache_hit = resp.from_cache
                elif hasattr(resp, '_from_cache'):
                    _last_cache_hit = resp._from_cache
                else:
                    _last_cache_hit = False
            else:
                _last_cache_hit = False
            return resp
        except requests.RequestException:
            _last_cache_hit = False
            return None

    resp = _get(url)
    if not resp or resp.status_code != 200:
        time.sleep(0.1)
        resp = _get(url)
        if not resp or resp.status_code != 200:
            return None

    if _is_empty_body(resp):
        vlog("fetch", f"[http] empty body (enc={resp.headers.get('Content-Encoding','-')}, cl={resp.headers.get('Content-Length','-')}); retry identity")
        h2 = dict(SESSION.headers)
        h2["Accept-Encoding"] = "identity"
        h2["Cache-Control"] = "no-cache"
        h2["Pragma"] = "no-cache"
        time.sleep(0.15 + random.random() * 0.2)
        resp = _get(url, headers=h2)

    if resp and _is_empty_body(resp):
        vlog("fetch", "[http] still empty; retry with cache-buster + identity")
        bust = f"_r={int(time.time()*1000)}"
        sep = "&" if ("?" in url) else "?"
        busted_url = f"{url}{sep}{bust}"
        h3 = dict(SESSION.headers)
        h3["Accept-Encoding"] = "identity"
        h3["Cache-Control"] = "no-cache"
        h3["Pragma"] = "no-cache"
        time.sleep(0.15 + random.random() * 0.2)
        resp = _get(busted_url, headers=h3)

    if not resp or resp.status_code != 200 or _is_empty_body(resp):
        return None

    try:
        return BeautifulSoup(resp.text, "lxml")
    except Exception:
        return None


def _parse_structured_json_ld(soup: BeautifulSoup) -> Dict[str, str]:
    """Parse structured JSON-LD data from page"""
    out = {}
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or "")
            def grab(d):
                if not isinstance(d, dict): return
                if d.get("@type") in ("MusicRecording", "MusicComposition"):
                    out["title"] = d.get("name") or out.get("title")
                    by = d.get("byArtist")
                    if isinstance(by, dict) and by.get("name"):
                        out["artists"] = by["name"]
                    elif isinstance(by, list):
                        out["artists"] = ", ".join([x.get("name") for x in by if isinstance(x, dict) and x.get("name")])
                    for k in ("contributor","creator"):
                        v = d.get(k)
                        if isinstance(v, list):
                            rem = [x.get("name") for x in v if isinstance(x, dict) and x.get("name")]
                            if rem:
                                out["remixers"] = ", ".join(rem)
                    if d.get("inAlbum"):
                        alb = d.get("inAlbum")
                        if isinstance(alb, dict):
                            out["release_name"] = alb.get("name") or out.get("release_name")
                    if d.get("datePublished"):
                        out["release_date"] = d.get("datePublished")
            if isinstance(data, list):
                for d in data: grab(d)
            elif isinstance(data, dict):
                grab(data)
        except Exception:
            continue
    return out


def _parse_next_data(soup: BeautifulSoup) -> Dict[str, str]:
    """Parse Next.js __NEXT_DATA__ script"""
    out = {}
    try:
        tag = soup.find("script", id="__NEXT_DATA__")
        if not tag or not tag.string:
            return out
        data = json.loads(tag.string)
        def dig(node):
            if isinstance(node, dict):
                if "title" in node and ("artists" in node or "performers" in node):
                    t = node.get("title") or node.get("name")
                    out["title"] = t or out.get("title")
                    arts = node.get("artists") or node.get("performers")
                    if isinstance(arts, list):
                        names = []
                        for a in arts:
                            if isinstance(a, dict):
                                nm = a.get("name") or a.get("title")
                                if nm: names.append(nm)
                        if names:
                            out["artists"] = ", ".join(dict.fromkeys(names))
                if "remixers" in node and isinstance(node["remixers"], list):
                    rnames = []
                    for r in node["remixers"]:
                        if isinstance(r, dict):
                            nm = r.get("name") or r.get("title")
                            if nm: rnames.append(nm)
                    if rnames:
                        out["remixers"] = ", ".join(dict.fromkeys(rnames))
                if "key" in node and isinstance(node["key"], (str,)):
                    out["key"] = node["key"]
                if "bpm" in node and node["bpm"]:
                    out["bpm"] = str(node["bpm"])
                if "label" in node and isinstance(node["label"], dict) and node["label"].get("name"):
                    out["label"] = node["label"]["name"]
                if "genres" in node and isinstance(node["genres"], list):
                    out["genres"] = ", ".join([g.get("name") for g in node["genres"] if isinstance(g, dict) and g.get("name")])
                if "releaseDate" in node and node["releaseDate"]:
                    out["release_date"] = node["releaseDate"]
                if "release" in node and isinstance(node["release"], dict) and node["release"].get("title"):
                    out["release_name"] = node["release"]["title"]
                for k in ("track", "data", "props", "pageProps", "results", "item", "items"):
                    v = node.get(k)
                    if v is not None:
                        dig(v)
            elif isinstance(node, list):
                for x in node:
                    dig(x)
        dig(data)
    except Exception:
        return out
    return out


@retry_with_backoff(
    max_retries=2,
    backoff_base=0.5,
    backoff_max=10.0,
    jitter=True
)
def parse_track_page(url: str) -> Tuple[str, str, Optional[str], Optional[int], Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Parse a Beatport track page and extract metadata"""
    soup = request_html(url)
    if soup is None:
        return "", "", None, None, None, None, None, None, None

    info = {}
    info.update(_parse_structured_json_ld(soup))
    if not info.get("title") or not info.get("artists"):
        info.update(_parse_next_data(soup))

    title = info.get("title") or ""
    if not title:
        title_el = soup.select_one("h1, h2")
        if title_el:
            txt = title_el.get_text(" ", strip=True)
            if txt and len(txt) > 2 and txt.lower() not in {"track", "title"}:
                title = txt

    artists = info.get("artists") or ""
    if not artists:
        header = soup.select_one("h1, h2")
        header = header.parent if header else None
        for _ in range(3):
            if header and header.find('a', href=re.compile(r"^/artist/")):
                break
            header = header.parent if header else None
        if header:
            chips = header.select('a[href^="/artist/"]')[:8]
            names = [c.get_text(strip=True) for c in chips if c.get_text(strip=True)]
            if names:
                artists = ", ".join(dict.fromkeys(names))
        if not artists:
            byline = soup.find(string=re.compile(r"^\s*Artists?\s*:\s*$", re.I))
            if byline and byline.parent:
                artists = re.sub(r"Artists?:\s*", "", byline.parent.get_text(" ", strip=True), flags=re.I)

    remixers = info.get("remixers") or ""
    if not remixers:
        def val_after_label(label_regex: str) -> Optional[str]:
            lbls = soup.find_all(string=re.compile(label_regex, re.I))
            for lab in lbls:
                try:
                    val = lab.find_parent().find_next_sibling()
                    if val:
                        text = val.get_text(" ", strip=True)
                        if text:
                            return text
                except Exception:
                    continue
            return None
        remixers = val_after_label(r"^\s*Remixers?\s*$") or ""

    title_remixers = _extract_remixer_names_from_title(title)
    if title_remixers:
        remixers = ", ".join([remixers, ", ".join(title_remixers)]).strip(", ")

    if remixers:
        a_list = _split_display_names(artists)
        r_list = _split_display_names(remixers)
        artists = _merge_name_lists(a_list, r_list) if a_list or r_list else (artists or remixers)

    def val_after_label(label_regex: str) -> Optional[str]:
        lbls = soup.find_all(string=re.compile(label_regex, re.I))
        for lab in lbls:
            try:
                val = lab.find_parent().find_next_sibling()
                if val:
                    text = val.get_text(" ", strip=True)
                    if text:
                        return text
            except Exception:
                continue
        return None

    key = info.get("key") or val_after_label(r"^\s*Key\s*$")
    bpm = info.get("bpm") or val_after_label(r"^\s*BPM\s*$")
    if bpm:
        bpm = re.sub(r"[^\d.]+", "", bpm) or bpm

    label = info.get("label")
    if label is None:
        for labx in soup.select('a[href^="/label/"]'):
            label = labx.get_text(strip=True)
            if label:
                break
        if label is None:
            label = val_after_label(r"^\s*Label\s*$")

    genres = info.get("genres")
    if genres is None:
        genre_links = soup.select('a[href^="/genre/"]')
        if genre_links:
            genres = ", ".join(dict.fromkeys([g.get_text(strip=True) for g in genre_links if g.get_text(strip=True)]))
        else:
            genres = val_after_label(r"^\s*Genres?\s*$")

    rel_name = info.get("release_name")
    if rel_name is None:
        rel_link = soup.select_one('a[href^="/release/"]')
        if rel_link:
            rel_name = rel_link.get_text(strip=True)
        if not rel_name:
            rel_name = val_after_label(r"^\s*Release\s*$")

    date_str = info.get("release_date") or val_after_label(r"(Release Date|Released)")
    rel_date_iso = None
    year = None
    if date_str:
        try:
            dt = dateparser.parse(date_str, fuzzy=True)
            rel_date_iso = dt.date().isoformat() if dt else None
            year = dt.year if dt else None
        except Exception:
            year = None
    if year is None:
        meta = soup.find("meta", {"property": "music:release_date"})
        if meta and meta.get("content"):
            try:
                ydt = dateparser.parse(meta["content"])
                year = ydt.year
                if not rel_date_iso:
                    rel_date_iso = ydt.date().isoformat()
            except Exception:
                pass

    return title or "", artists or "", key, year, bpm, label, genres, rel_name, rel_date_iso


def track_urls(idx: int, query: str, max_results: int, use_direct_search: Optional[bool] = None, fallback_to_browser: bool = False) -> List[str]:
    """
    Unified search function that can use direct Beatport search, DuckDuckGo, or both.
    
    Args:
        idx: Track index for logging
        query: Search query
        max_results: Maximum results to return
        use_direct_search: If True, use direct Beatport search; if False, use DuckDuckGo;
                          if None, use SETTINGS to decide (hybrid mode for remixes)
        fallback_to_browser: If True and other methods find many results but might miss the track,
                           try browser automation as fallback
    
    Returns:
        List of Beatport track URLs
    """
    # Check if we should use direct search
    if use_direct_search is None:
        # Auto-detect: use direct search for remix queries OR original mix queries (more reliable)
        # FIRST: Extract search terms if query has "site:beatport.com" prefix (DuckDuckGo format)
        search_terms_for_detection = query
        if "site:beatport.com" in query.lower():
            parts = query.split("site:beatport.com", 1)
            if len(parts) > 1:
                search_terms_for_detection = parts[1].strip()
                # Remove "/track" prefix if present
                if search_terms_for_detection.startswith("/track"):
                    search_terms_for_detection = search_terms_for_detection[6:].strip()
                search_terms_for_detection = search_terms_for_detection.strip()
        
        # Clean query for detection - remove quotes but preserve parentheses (they indicate remix info)
        clean_query_for_detection = search_terms_for_detection.strip('"').strip("'").strip()
        # Remove quote marks but preserve parentheses
        clean_query_for_detection = clean_query_for_detection.replace('"""', '').replace('"', '').replace("'", '')
        ql = (clean_query_for_detection or "").lower()
        has_remix_keywords = (" remix" in ql) or ("extended mix" in ql) or (ql.count("(") > 0 and ql.count(")") > 0)
        has_original_mix = "original mix" in ql
        use_direct_search = SETTINGS.get("USE_DIRECT_SEARCH_FOR_REMIXES", True) and (has_remix_keywords or has_original_mix)
    
    if use_direct_search:
        # Try direct Beatport search with multiple methods
        try:
            from beatport_search import beatport_search_direct, beatport_search_browser
            
            # Method 1: Try API/direct HTML scraping
            # Extract just the search terms if query has "site:beatport.com" prefix
            search_query = query
            if "site:beatport.com" in query.lower():
                # Extract the part after "site:beatport.com/track" or just "site:beatport.com"
                parts = query.split("site:beatport.com", 1)
                if len(parts) > 1:
                    search_query = parts[1].strip()
                    # Remove "/track" prefix if present
                    if search_query.startswith("/track"):
                        search_query = search_query[6:].strip()
                    search_query = search_query.strip()
                    # Remove quotes for search (but preserve for browser search)
                    search_query = search_query.strip('"').strip("'").strip()
                    search_query = search_query.replace('"""', '').replace('"', '').replace("'", '')
            
            direct_urls = beatport_search_direct(idx, search_query, max_results)
            # Clean query for remix detection - use search_query (already cleaned) instead of original query
            clean_query_for_check = search_query.strip('"').strip("'").strip()
            clean_query_for_check = clean_query_for_check.replace('"""', '').replace('"', '').replace("'", '')
            ql = (clean_query_for_check or "").lower()
            is_remix_query = (" remix" in ql) or ("extended mix" in ql) or (ql.count("(") > 0 and ql.count(")") > 0)
            
            # If direct search found results, check if we need browser automation for remix queries
            if direct_urls and len(direct_urls) > 0:
                # If we found some results but it's a remix query and we found very few, try browser automation
                if is_remix_query and len(direct_urls) < 5 and SETTINGS.get("USE_BROWSER_AUTOMATION", False):
                    vlog(idx, f"[search] Direct search found {len(direct_urls)} URLs for remix query, trying browser automation")
                    browser_urls = beatport_search_browser(idx, search_query, max_results)
                    if browser_urls:
                        # Merge results (browser automation finds more, prepend its results)
                        seen = set(direct_urls)
                        merged = []
                        # First add browser results (more reliable)
                        for url in browser_urls:
                            if url not in seen:
                                seen.add(url)
                                merged.append(url)
                                if len(merged) >= max_results:
                                    break
                        # Then add direct search results
                        for url in direct_urls:
                            if url not in seen:
                                seen.add(url)
                                merged.append(url)
                                if len(merged) >= max_results:
                                    break
                        vlog(idx, f"[search] Combined {len(merged)} URLs (browser {len(browser_urls)} + direct {len(direct_urls)})")
                        return merged[:max_results]
                
                if direct_urls:
                    return direct_urls[:max_results]
            
            # Method 2: Try browser automation if enabled and direct search found nothing OR very few results
            # For remix queries, browser automation is critical since pages are JS-rendered
            # CRITICAL: If direct search found very few results (<10) for a remix query, try browser automation
            # This fixes cases like "Tighter (CamelPhat Remix) HOSH" where direct search might miss the track
            if SETTINGS.get("USE_BROWSER_AUTOMATION", False):
                # If direct search found nothing, or if it's a remix query and found very few results, try browser
                should_try_browser = False
                if direct_urls is None or len(direct_urls) == 0:
                    should_try_browser = True
                    vlog(idx, f"[search] Direct search found 0 URLs, trying browser automation")
                elif is_remix_query and len(direct_urls) < 10:
                    # For remix queries, if we found <10 results, browser might find more
                    vlog(idx, f"[search] Direct search found only {len(direct_urls)} URLs for remix query, trying browser automation")
                    should_try_browser = True
                
                if should_try_browser:
                    # Use the cleaned search_query (without site: prefix) for browser automation
                    browser_query = search_query if 'search_query' in locals() else query
                    browser_urls = beatport_search_browser(idx, browser_query, max_results)
                    if browser_urls:
                        vlog(idx, f"[search] Browser automation found {len(browser_urls)} URLs")
                        # If direct search also found some, merge them (browser results first, they're more reliable)
                        if direct_urls and len(direct_urls) > 0:
                            seen = set(browser_urls)
                            merged = list(browser_urls)
                            for url in direct_urls:
                                if url not in seen:
                                    seen.add(url)
                                    merged.append(url)
                                    if len(merged) >= max_results:
                                        break
                            vlog(idx, f"[search] Merged {len(merged)} URLs (browser {len(browser_urls)} + direct {len(direct_urls)})")
                            return merged[:max_results]
                        return browser_urls
            
            # If both fail, fall through to DuckDuckGo
        except ImportError:
            # beatport_search module not available, fall through to DuckDuckGo
            pass
        except Exception as e:
            vlog(idx, f"[search] direct search failed: {e!r}, falling back to DuckDuckGo")
    
    # Fall back to DuckDuckGo
    ddg_urls = ddg_track_urls(idx, query, max_results)
    
    # CRITICAL: If DuckDuckGo finds many results (50+) but we're looking for a specific track,
    # try browser automation to find the exact track. This fixes cases like:
    # - "Tim Green The Night is Blue" where DDG returns 100+ results but misses the correct track
    # - Queries with artist names that might be better found via Beatport's own search
    # Only do this if:
    # 1) fallback_to_browser is True (explicit request), OR
    # 2) Query looks like an artist+title search (has space and likely artist name)
    should_try_browser = False
    if fallback_to_browser:
        should_try_browser = True
    elif len(ddg_urls) >= 50 and SETTINGS.get("USE_BROWSER_AUTOMATION", False):
        # Auto-detect artist+title queries: if query has spaces and looks like it might be
        # a specific track search (not just a title), try browser automation
        ql = (query or "").strip()
        words = ql.split()
        # If query has 2+ words and doesn't look like just a quoted title, likely artist+title
        if len(words) >= 2 and not (query.startswith('"') and query.endswith('"')):
            # Check if it's not a remix query (those already use direct search)
            if not ((" remix" in ql.lower()) or ("extended mix" in ql.lower())):
                should_try_browser = True
    
    if should_try_browser and SETTINGS.get("USE_BROWSER_AUTOMATION", False):
        vlog(idx, f"[search] DDG found {len(ddg_urls)} results, trying browser automation for better accuracy")
        try:
            from beatport_search import beatport_search_browser
            browser_urls = beatport_search_browser(idx, query, max_results)
            if browser_urls:
                # Merge browser results with DDG results (browser is more reliable, prepend its results)
                seen = set()
                merged = []
                # First add browser results (more reliable)
                for url in browser_urls:
                    if url not in seen:
                        seen.add(url)
                        merged.append(url)
                        if len(merged) >= max_results:
                            break
                # Then add DDG results that aren't already there
                for url in ddg_urls:
                    if url not in seen:
                        seen.add(url)
                        merged.append(url)
                        if len(merged) >= max_results:
                            break
                vlog(idx, f"[search] Combined {len(merged)} URLs (browser {len(browser_urls)} + DDG {len(ddg_urls)})")
                return merged[:max_results]
        except ImportError:
            pass
        except Exception as e:
            vlog(idx, f"[search] Browser fallback failed: {e!r}")
    
    return ddg_urls


def ddg_track_urls(idx: int, query: str, max_results: int) -> List[str]:
    """Enhanced search with multiple query strategies and better fallback."""
    urls: List[str] = []
    try:
        mr = max_results if max_results and max_results > 0 else 60
        ql = (query or "").lower()
        # Increase max results for remix/extended queries - they often need more results to find the right track
        # For exact quoted remix queries (like "Never Sleep Again (Keinemusik Remix)"), increase even more
        is_exact_remix_query = query.startswith('"') and query.endswith('"') and ((" remix" in ql) or ("(" in ql and ")" in ql))
        if (" remix" in ql) or ("extended mix" in ql) or ("re-fire" in ql) or ("refire" in ql) or ("rework" in ql) or ("re-edit" in ql) or ("(" in ql and ")" in ql) or re.search(r"\bstyler\b", ql):
            if is_exact_remix_query:
                mr = max(mr, 200)  # Even higher for exact quoted remix queries
            else:
                mr = max(mr, 150)  # Increased from 120 for better remix discovery
        
        # Try multiple search strategies - prioritize quoted/exact matches
        # For quoted queries, try quoted first (more specific)
        if query.startswith('"') and query.endswith('"'):
            # Already quoted, use as-is
            search_queries = [
                f'site:beatport.com/track {query}',
                f'site:beatport.com {query}',
            ]
        else:
            # Not quoted - try quoted version first for better precision
            search_queries = [
                f'site:beatport.com/track "{query}"',  # Quoted version first (better precision)
                f"site:beatport.com/track {query}",
                f"site:beatport.com {query}",  # Broader search last
            ]
        
        with DDGS() as ddgs:
            for search_q in search_queries:
                try:
                    for r in ddgs.text(search_q, region="us-en", max_results=mr):
                        href = r.get("href") or r.get("url") or ""
                        if "beatport.com/track/" in href:
                            urls.append(href)
                    # For remix queries, don't break early - we need to find specific tracks
                    # Only break early for non-remix queries with many results
                    if len(urls) >= 20 and (" remix" not in ql and "extended mix" not in ql):
                        break
                except Exception as e:
                    vlog(idx, f"[search] ddgs error for '{search_q}': {e!r}")
                    continue
    except Exception as e:
        vlog(idx, f"[search] ddgs error: {e!r}")
        return []
    out, seen = [], set()
    for u in urls:
        if is_track_url(u) and u not in seen:
            seen.add(u); out.append(u)

    # Enhanced fallback: when we don't find the expected track, try broader searches
    try:
        LOW_TRACK_THRESHOLD = 4
        ql = (query or "").lower().strip()
        primary_tok = ql.split()[0] if ql else ""
        needs_fallback = len(out) < LOW_TRACK_THRESHOLD
        
        # Check if we found the primary token in any URL
        if primary_tok and len(primary_tok) >= 3:
            found_primary = any((primary_tok in u.lower()) for u in out)
            if not found_primary:
                needs_fallback = True
        
        # More aggressive fallback for specific cases
        if needs_fallback and (" " in ql):
            extra_pages: list[str] = []
            
            # Try broader searches
            fallback_queries = [
                f"site:beatport.com {query}",
                f"site:beatport.com \"{query}\"",
                f"beatport.com {query}",
            ]
            
            with DDGS() as ddgs:
                for fallback_q in fallback_queries:
                    try:
                        for r in ddgs.text(fallback_q, region="us-en", max_results=20):
                            href = r.get("href") or r.get("url") or ""
                            if href and "beatport.com" in href:
                                extra_pages.append(href)
                    except Exception as e:
                        vlog(idx, f"[fallback-search] error for '{fallback_q}': {e!r}")
                        continue
            
            # Process extra pages to find track links
            for page_url in extra_pages[:6]:
                if "/track/" in page_url:
                    # If it's already a track URL, add it directly
                    if is_track_url(page_url) and page_url not in seen:
                        seen.add(page_url); out.append(page_url)
                    continue
                    
                soup = request_html(page_url)
                if not soup:
                    continue
                    
                # Look for track links
                for a in soup.select('a[href^="/track/"]'):
                    try:
                        href = a.get("href") or ""
                        if not href:
                            continue
                        full = BASE_URL + href if href.startswith("/track/") else href
                        if is_track_url(full) and full not in seen:
                            seen.add(full); out.append(full)
                    except Exception:
                        continue
    except Exception as _e:
        vlog(idx, f"[fallback-release] skipped: {_e!r}")

    # Special case: if we have very few results and the query looks like a specific track,
    # try to construct potential URLs based on common Beatport patterns
    if len(out) < 3 and ql and " " in ql:
        try:
            # Extract potential track name and artist from query
            parts = ql.split()
            if len(parts) >= 2:
                # Try common URL patterns
                track_name = "-".join(parts[:-1])  # Everything except last part (artist)
                artist_name = parts[-1]  # Last part (artist)
                
                # Broader searches
                broader_searches = [
                    f"site:beatport.com {track_name} {artist_name}",
                    f"site:beatport.com \"{track_name}\" {artist_name}",
                    f"beatport.com {track_name} {artist_name}",
                ]
                
                with DDGS() as ddgs:
                    for broad_q in broader_searches:
                        try:
                            for r in ddgs.text(broad_q, region="us-en", max_results=10):
                                href = r.get("href") or r.get("url") or ""
                                if href and "beatport.com/track/" in href and href not in seen:
                                    seen.add(href); out.append(href)
                        except Exception as e:
                            vlog(idx, f"[broader-search] error for '{broad_q}': {e!r}")
                            continue
        except Exception as e:
            vlog(idx, f"[url-construction] error: {e!r}")

    if SETTINGS["TRACE"]:
        from utils import tlog
        for i, u in enumerate(out, 1):
            tlog(idx, f"[cand {i}] {u}")
    return out

