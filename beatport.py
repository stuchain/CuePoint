#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Beatport scraping and parsing utilities
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
from utils import vlog


@dataclass
class BeatportCandidate:
    """Represents a Beatport track candidate"""
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


def request_html(url: str) -> Optional[BeautifulSoup]:
    """Fetch a URL robustly, handling empty gzipped/brotli responses by retrying without compression."""
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
            return SESSION.get(u, timeout=to, allow_redirects=True, headers=headers)
        except requests.RequestException:
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


def track_urls(idx: int, query: str, max_results: int, use_direct_search: Optional[bool] = None) -> List[str]:
    """
    Unified search function that can use direct Beatport search, DuckDuckGo, or both.
    
    Args:
        idx: Track index for logging
        query: Search query
        max_results: Maximum results to return
        use_direct_search: If True, use direct Beatport search; if False, use DuckDuckGo;
                          if None, use SETTINGS to decide (hybrid mode for remixes)
    
    Returns:
        List of Beatport track URLs
    """
    # Check if we should use direct search
    if use_direct_search is None:
        # Auto-detect: use direct search for remix queries (more reliable)
        ql = (query or "").lower()
        has_remix_keywords = (" remix" in ql) or ("extended mix" in ql) or ("(" in ql and ")" in ql)
        use_direct_search = SETTINGS.get("USE_DIRECT_SEARCH_FOR_REMIXES", True) and has_remix_keywords
    
    if use_direct_search:
        # Try direct Beatport search with multiple methods
        try:
            from beatport_search import beatport_search_direct, beatport_search_browser
            
            # Method 1: Try API/direct HTML scraping
            direct_urls = beatport_search_direct(idx, query, max_results)
            if direct_urls:
                # If we found some results but it's a remix query and we found very few, try browser automation
                ql = (query or "").lower()
                is_remix_query = (" remix" in ql) or ("extended mix" in ql) or ("(" in ql and ")" in ql)
                if is_remix_query and len(direct_urls) < 5 and SETTINGS.get("USE_BROWSER_AUTOMATION", False):
                    vlog(idx, f"[search] Direct search found {len(direct_urls)} URLs for remix query, trying browser automation")
                    browser_urls = beatport_search_browser(idx, query, max_results)
                    if browser_urls:
                        # Merge results (browser automation finds more)
                        seen = set(direct_urls)
                        for url in browser_urls:
                            if url not in seen:
                                seen.add(url)
                                direct_urls.append(url)
                                if len(direct_urls) >= max_results:
                                    break
                        vlog(idx, f"[search] Combined: {len(direct_urls)} URLs (direct + browser)")
                
                if direct_urls:
                    return direct_urls[:max_results]
            
            # Method 2: Try browser automation if enabled and direct search found nothing
            # For remix queries, browser automation is critical since pages are JS-rendered
            if SETTINGS.get("USE_BROWSER_AUTOMATION", False):
                browser_urls = beatport_search_browser(idx, query, max_results)
                if browser_urls:
                    vlog(idx, f"[search] Browser automation found {len(browser_urls)} URLs")
                    return browser_urls
            
            # If both fail, fall through to DuckDuckGo
        except ImportError:
            # beatport_search module not available, fall through to DuckDuckGo
            pass
        except Exception as e:
            vlog(idx, f"[search] direct search failed: {e!r}, falling back to DuckDuckGo")
    
    # Fall back to DuckDuckGo
    return ddg_track_urls(idx, query, max_results)


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

