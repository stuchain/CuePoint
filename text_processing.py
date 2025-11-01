#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Text processing utilities: normalization, sanitization, and similarity scoring
"""

import html
import re
import unicodedata

from typing import List, Tuple

from rapidfuzz import fuzz, process

from config import SETTINGS


def _strip_accents(s: str) -> str:
    """Strip accents from a string"""
    if not s:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))


def normalize_text(s: str) -> str:
    """Normalize text for comparison"""
    if not s:
        return ""
    s = _strip_accents(html.unescape(s))
    s = s.lower().strip()
    s = s.replace("—", " ").replace("–", " ").replace("‐", " ").replace("-", " ")
    s = re.sub(r"\s+\(feat\.?.*?\)", "", s, flags=re.I)
    s = re.sub(r"\s+\[feat\.?.*?\]", "", s, flags=re.I)
    s = re.sub(r"\s+feat\.?.*$", "", s, flags=re.I)
    s = re.sub(r"\((original mix|extended mix|edit|remix|vip|dub|version|radio edit|club mix)\)", "", s, flags=re.I)
    s = re.sub(r"[^a-z0-9\s&/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r'\b(original\s+mix|extended\s+mix|radio\s+edit|club\s+mix|edit|vip|version)\b', ' ', s, flags=re.I)
    s = re.sub(r'(?i)(original\s*mix|extended\s*mix|radio\s*edit|club\s*mix|edit|vip|version)$', ' ', s)
    s = re.sub(r'(?i)(originalmix|extendedmix|radioedit|clubmix)$', ' ', s)
    return s


def sanitize_title_for_search(title: str) -> str:
    """Sanitize title for search queries"""
    if not title:
        return ""
    t = title
    t = t.replace("—", " ").replace("–", " ").replace("‐", " ").replace("-", " ")
    t = re.sub(r"www\.[^\s]+", " ", t)
    
    # Handle complex artist-title patterns like "Cajmere, Dajae, Marco Lys - Cajmere ft. Dajae - Brighter Days (Marco Lys Remix)"
    if " - " in t and t.count(" - ") >= 2:
        # Split by " - " and take the last part as the actual title
        parts = t.split(" - ")
        if len(parts) >= 3:
            t = parts[-1]  # Take the last part as the title
    
    # Handle patterns like "Artist1, Artist2 - Title (Remix)" -> extract just "Title"
    if " - " in t and "(" in t:
        # Find the last " - " and take everything after it
        last_dash = t.rfind(" - ")
        if last_dash != -1:
            title_part = t[last_dash + 3:].strip()
            if title_part:
                t = title_part
    
    t = re.sub(r"\((?:\s*(?:original mix|extended mix|radio edit|club mix|edit|vip|version)\s*)\)", " ", t, flags=re.I)
    t = re.sub(r"\[(?:\s*(?:original mix|extended mix|radio edit|club mix|edit|vip|version)\s*)\]", " ", t, flags=re.I)
    t = re.sub(r"\b(original mix|extended mix|radio edit|club mix|edit|vip|version)\b", " ", t, flags=re.I)
    
    # Remove numeric prefixes like [2-3], [3], etc.
    t = re.sub(r"\[[\d\-\s]+\]\s*", " ", t)
    
    t = re.sub(r"\([^)]*\)", " ", t)
    t = re.sub(r"\[[^\]]*\]", " ", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    # Remove single-letter bracket tokens like (F) or [F]
    t = re.sub(r"\s*[\[(]\s*[A-Za-z]\s*[\])]\s*", " ", t)
    # Remove Hebrew and other non-Latin characters but keep the core title
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
    """Calculate similarity scores for title and artists"""
    t1 = normalize_text(title_a)
    t2 = normalize_text(title_b)
    title_sim = fuzz.token_set_ratio(t1, t2)
    artist_sim = artists_similarity(artists_a, artists_b)
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

