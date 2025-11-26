#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Text processing utilities: normalization, sanitization, and similarity scoring

This module provides functions for:
1. Text normalization: Removing accents, converting to lowercase, handling Unicode
2. Title sanitization: Removing prefixes like [F], [3], cleaning for search
3. Similarity scoring: Using RapidFuzz for fuzzy string matching
4. Artist processing: Splitting artist strings, calculating artist similarity

Key functions:
- normalize_text(): Normalizes text for comparison (removes accents, lowercase, etc.)
- sanitize_title_for_search(): Cleans titles by removing prefixes and noise
- score_components(): Calculates title and artist similarity scores
- artists_similarity(): Compares two artist strings using fuzzy matching
"""

import html
import re
import unicodedata

from typing import List, Tuple

from rapidfuzz import fuzz, process

from cuepoint.models.config import SETTINGS


def _strip_accents(s: str) -> str:
    """
    Strip accents/diacritics from a string using Unicode decomposition
    
    Example:
        "café" → "cafe"
        "naïve" → "naive"
    
    Args:
        s: Input string (may contain accented characters)
    
    Returns:
        String with accents removed
    """
    if not s:
        return ""
    # Unicode normalization: decompose characters, then filter out combining marks (accents)
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))


def normalize_text(s: str) -> str:
    """
    Normalize text for fuzzy comparison
    
    This function prepares text for similarity matching by:
    1. Removing HTML entities and accents
    2. Converting to lowercase
    3. Removing common noise (feat. clauses, mix types, etc.)
    4. Standardizing whitespace and punctuation
    
    Example:
        "Never Sleep Again (Extended Mix) feat. John" → "never sleep again"
    
    Args:
        s: Input text string
    
    Returns:
        Normalized string ready for comparison
    """
    if not s:
        return ""
    s = _strip_accents(html.unescape(s))  # Remove accents and HTML entities
    s = s.lower().strip()  # Convert to lowercase
    s = s.replace("—", " ").replace("–", " ").replace("‐", " ").replace("-", " ")  # Normalize dashes
    
    # Remove "feat." clauses (they vary too much between sources)
    s = re.sub(r"\s+\(feat\.?.*?\)", "", s, flags=re.I)
    s = re.sub(r"\s+\[feat\.?.*?\]", "", s, flags=re.I)
    s = re.sub(r"\s+feat\.?.*$", "", s, flags=re.I)
    
    # Remove mix type indicators (they're handled separately)
    s = re.sub(r"\((original mix|extended mix|edit|remix|vip|dub|version|radio edit|club mix)\)", "", s, flags=re.I)
    
    # Keep only alphanumeric, spaces, &, /
    s = re.sub(r"[^a-z0-9\s&/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()  # Normalize whitespace
    
    # Remove mix type keywords that weren't in parentheses
    s = re.sub(r'\b(original\s+mix|extended\s+mix|radio\s+edit|club\s+mix|edit|vip|version)\b', ' ', s, flags=re.I)
    s = re.sub(r'(?i)(original\s*mix|extended\s*mix|radio\s*edit|club\s*mix|edit|vip|version)$', ' ', s)
    s = re.sub(r'(?i)(originalmix|extendedmix|radioedit|clubmix)$', ' ', s)
    return s


def sanitize_title_for_search(title: str) -> str:
    """
    Sanitize track title for search queries
    
    This function removes noise from titles that would hurt search accuracy:
    - Numeric prefixes like [2-3], [3], [F]
    - Parenthetical mix type indicators
    - Complex artist-title patterns (extracts just the title part)
    - Non-Latin characters (keeps basic Latin with accents)
    
    Critical: This function ensures we NEVER search with prefixes like [F], [3]
    These are Rekordbox-specific markers that don't exist in Beatport titles.
    
    Example:
        "[8-9] Tighter (CamelPhat Remix)" → "Tighter"
        "[F] Never Sleep Again" → "Never Sleep Again"
    
    Args:
        title: Original track title from Rekordbox
    
    Returns:
        Clean title ready for search queries
    """
    if not title:
        return ""
    t = title
    t = t.replace("—", " ").replace("–", " ").replace("‐", " ").replace("-", " ")
    t = re.sub(r"www\.[^\s]+", " ", t)  # Remove URLs
    
    # Handle complex patterns like "Artist1 - Artist2 - Title (Remix)"
    # Extract just the title part (last segment after " - ")
    if " - " in t and t.count(" - ") >= 2:
        parts = t.split(" - ")
        if len(parts) >= 3:
            t = parts[-1]  # Take the last part as the title
    
    # Extract title from "Artist - Title (Remix)" pattern
    if " - " in t and "(" in t:
        last_dash = t.rfind(" - ")
        if last_dash != -1:
            title_part = t[last_dash + 3:].strip()
            if title_part:
                t = title_part
    
    # Remove mix type indicators (parenthesized or bracketed)
    t = re.sub(r"\((?:\s*(?:original mix|extended mix|radio edit|club mix|edit|vip|version)\s*)\)", " ", t, flags=re.I)
    t = re.sub(r"\[(?:\s*(?:original mix|extended mix|radio edit|club mix|edit|vip|version)\s*)\]", " ", t, flags=re.I)
    t = re.sub(r"\b(original mix|extended mix|radio edit|club mix|edit|vip|version)\b", " ", t, flags=re.I)
    
    # Remove numeric prefixes like [2-3], [3], etc.
    t = re.sub(r"\[[\d\-\s]+\]\s*", " ", t)
    
    # Remove all remaining parenthetical/bracketed content
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(r"\[[^\]]*\]", " ", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    
    # Remove single-letter bracket tokens like (F) or [F]
    t = re.sub(r"\s*[\[(]\s*[A-Za-z]\s*[\])]\s*", " ", t)
    
    # Remove non-Latin characters (keeps basic Latin with accents)
    t = re.sub(r'[^\x00-\x7F\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]', ' ', t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t


def split_artists(artist_str: str) -> List[str]:
    """Split artist string into list of individual artists"""
    if not artist_str:
        return []
    s = artist_str.replace(" feat. ", ", ").replace(" ft. ", ", ").replace(" featuring ", ", ")
    parts = re.split(r",|&|/| x | vs | with ", s, flags=re.IGNORECASE)
    return [normalize_text(p) for p in parts if normalize_text(p)]


def artists_similarity(a: str, b: str) -> int:
    """Calculate similarity between two artist strings"""
    list_a = split_artists(a)
    list_b = split_artists(b)
    if not list_a or not list_b:
        return 0
    scores = []
    for x in list_a:
        best = process.extractOne(x, list_b, scorer=fuzz.token_set_ratio)
        if best:
            scores.append(best[1])
    return int(sum(scores) / len(scores)) if scores else 0


def score_components(title_a: str, artists_a: str, title_b: str, artists_b: str) -> Tuple[int, int, float]:
    """
    Calculate similarity scores for title and artists
    
    This is the core scoring function that calculates:
    - Title similarity (0-100): How similar the titles are
    - Artist similarity (0-100): How similar the artists are
    - Combined score: Weighted combination based on TITLE_WEIGHT and ARTIST_WEIGHT
    
    Uses RapidFuzz's token_set_ratio for title matching (order-independent, set-based).
    Uses custom artist matching that handles multiple artists and separators.
    
    Args:
        title_a: First title
        artists_a: First artist string
        title_b: Second title (candidate)
        artists_b: Second artist string (candidate)
    
    Returns:
        Tuple of (title_sim, artist_sim, combined_score)
        - title_sim: 0-100 integer
        - artist_sim: 0-100 integer
        - combined_score: Weighted float (typically 0-100)
    """
    t1 = normalize_text(title_a)
    t2 = normalize_text(title_b)
    # token_set_ratio: Order-independent, set-based comparison
    # "A B C" vs "C B A" = 100% (same tokens, different order)
    title_sim = fuzz.token_set_ratio(t1, t2)
    artist_sim = artists_similarity(artists_a, artists_b)
    # Weighted combination (typically 55% title, 45% artist)
    comp = SETTINGS["TITLE_WEIGHT"] * title_sim + SETTINGS["ARTIST_WEIGHT"] * artist_sim
    return title_sim, artist_sim, comp


def _artist_token_overlap(a: str, b: str) -> bool:
    """Check if artist tokens overlap"""
    def toks(x: str) -> set:
        x = _strip_accents(x.lower())
        x = re.sub(r'\([^)]*\)', ' ', x)
        x = re.sub(r'(feat\.?|ft\.?|featuring)\b', ' ', x)
        x = re.sub(r'[^a-z0-9\s]+', ' ', x)
        return set(filter(None, re.split(r'\s+', x)))
    A, B = toks(a), toks(b)
    if not A or not B:
        return False
    
    # Check for exact token overlap
    overlap = A & B
    if overlap:
        return True
    
    # Check for partial matches (e.g., "Adam Port" vs "Port")
    for token_a in A:
        for token_b in B:
            if len(token_a) >= 3 and len(token_b) >= 3:
                if token_a in token_b or token_b in token_a:
                    return True
    
    return False


def _word_tokens(s: str) -> List[str]:
    """Extract word tokens from normalized text"""
    s = normalize_text(s)
    toks = [t for t in re.split(r"\s+", s) if t]
    return toks

