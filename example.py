#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Rekordbox → Beatport metadata enricher
Accuracy-first + Structured Parsing + Full Candidates Log + Timestamped outputs

Upgrades in this version:
  • Expanded query generation (precision-first, deterministic):
      – Title: all contiguous n-grams (quoted + unquoted), remix-preserving
      – Artists: separator-level subsets (A,B,C …) + single-word tokens (e.g., "Gorje")
      – Cross title uni/bi-grams with artist variants in both orders ("Never Gorje", "Gorje Never")
      – NEW: Full title × subsets of single-word artist tokens ("Never Been Gorje", "Never Been Hewek", ...)
      – De-duplicated; stable ordering; quoted/unquoted permutations
  • Practical “no cap” via --exhaustive:
      – Raises per-query DDG fetch limit (60+), removes final slicing, extends per-track budget
      – Still bounded by PER_TRACK_TIME_BUDGET_SEC and polite concurrency
  • Queries audit CSV: logs EVERY query (even when 0 candidates returned)
  • Determinism + guardrails preserved

  • NEW/CHANGED:
      – --all-queries now truly runs EVERY query variation: disables time budget, waits for all candidate fetches,
        enables trigram crosses (no “small-only” cap).
      – Robust candidate fetch: no crash on as_completed timeout; processes finished futures and continues.
  • NEW:
      – --exhaustive-combos: generate ALL order-preserving title word combinations (sizes 2..N),
        cross with artist token subsets (size 1..M), both orders, quoted/unquoted; optional permutations for small k.
      – PRIORITY STAGE: try “full title + ONE artist” first, then “full title + TWO-artist subsets”, then everything else.
      – Mix-aware scoring/guards + stricter early-exit that respects mix intent.

  • NEW (this patch):
      – Stronger bias for special parentheticals (e.g., "(Ivory Re-fire)") and explicit refire/rework nudges.
      – Wire mix/phrase context from process_track into best_beatport_match so bonuses apply.
      – Prefer-plain behavior when no mix is stated; explicit remix intent fast path.
      – Robust HTTP fetcher handles gzip/br with empty body by retrying without compression.
"""

import argparse
import csv
import hashlib
import html
import os
import random
import re
import sys
import time
import unicodedata
import warnings

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz, process
from dateutil import parser as dateparser
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from ddgs import DDGS
from itertools import combinations, permutations

# -----------------------------
# Config & defaults
# -----------------------------
SETTINGS = {
    "MAX_SEARCH_RESULTS": 50,    # per-query fetch from DDG (raised to improve recall on sparse queries)
    "CANDIDATE_WORKERS": 8,      # per-track candidate fetch concurrency
    "TRACK_WORKERS": 1,          # playlist-level concurrency
    "PER_TRACK_TIME_BUDGET_SEC": 25,

    # Similarity weights (per your request)
    "TITLE_WEIGHT": 0.55,
    "ARTIST_WEIGHT": 0.45,

    "MIN_ACCEPT_SCORE": 55,      # require minimum score for acceptance (lowered from 60)
    "VERBOSE": False,
    "TRACE": False,
    "CONNECT_TIMEOUT": 5,
    "READ_TIMEOUT": 10,
    "ENABLE_CACHE": False,       # auto-enabled in fast/turbo if requests-cache is present

    # Early exit
    "EARLY_EXIT_SCORE": 95,         # Stop early if a guard-passing candidate reaches ≥95
    "EARLY_EXIT_MIN_QUERIES": 12,   # don’t early-stop before at least this many queries
    "EARLY_EXIT_REQUIRE_MIX_OK": True,

    # Early-exit (family consensus)
    "EARLY_EXIT_FAMILY_SCORE": 93,      # allow early exit on strong full-title+one-artist hit
    "EARLY_EXIT_FAMILY_AFTER": 8,       # but only after at least this many queries in the track
    "EARLY_EXIT_FAMILY_AFTER_ORIGINAL": 6,
    "EARLY_EXIT_MIN_QUERIES_ORIGINAL": 8,

    # Adaptive max_results per query type
    "ADAPTIVE_MAX_RESULTS": True,
    "MR_LOW": 15,
    "MR_MED": 40,
    "MR_HIGH": 100,

    # Hard cap on how many candidate URLs we consider per query (after dedup/fallback). None = no cap.
    "PER_QUERY_CANDIDATE_CAP": None,

    # When title explicitly implies remix/special variant
    "EARLY_EXIT_MIN_QUERIES_REMIX": 5,    # allow earlier exit when remix/special intent is explicit
    "EARLY_EXIT_SCORE_REMIX": 93,         # lower threshold for remix/special-intent early exit
    "REMIX_MAX_QUERIES": 24,              # hard cap when remix intent is explicit
    "ALLOW_GENERIC_ARTIST_REMIX_HINTS": False,  # don’t add generic "<artist> remix" unless enabled

    "SEED": 0,                   # determinism (ordering/ties)

    # Query generation controls
    "TITLE_GRAM_MAX": 3,                 # up to trigrams from the title
    "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,  # cross N-grams with artist variants
    "CROSS_SMALL_ONLY": True,            # only cross uni/bi-grams (control blow-up)
    "REVERSE_ORDER_QUERIES": False,      # don't reverse by default
    "PRIORITY_REVERSE_STAGE": True,      # allow reversed order only in priority stage
    "REVERSE_REMIX_HINTS": True,         # always allow reversed order for remixer-hint queries

    # Cross full title with artist *word* subsets (first/last names)
    "CROSS_TITLE_WITH_ARTIST_WORD_SUBSETS": False,
    "ARTIST_WORD_SUBSET_MAX": 3,         # cap subset size

    # Run ALL query variants (no early stop, no join timeout)
    "RUN_ALL_QUERIES": False,

    # Require full title + at least one artist in queries (when artists are provided)
    "FULL_TITLE_WITH_ARTIST_ONLY": True,
    "FULL_ARTIST_ENTITY_ONLY": True,
    # Do not generate short forced pairs like "never gorje"
    "ENABLE_FORCED_SHORT_PAIRS": False,

    # ===== Exhaustive title combos (optional) =====
    "RUN_EXHAUSTIVE_COMBOS": False,      # enable order-preserving title combinations 2..N
    "TITLE_COMBO_MIN_LEN": 2,            # start at 2-word combos
    "TITLE_COMBO_MAX_LEN": 6,            # cap combos to 6 words by default
    "INCLUDE_PERMUTATIONS": False,       # also permute token subsets for small k
    "PERMUTATION_K_CAP": 5,              # only permute when k <= this
    "MAX_COMBO_QUERIES": None,           # optional cap (int) to avoid accidental blowups
    "QUOTED_TITLE_VARIANT": False,       # disable quoted variants globally

    # Linear prefixes only for grams/combos
    "LINEAR_PREFIX_ONLY": True,          # use only left-anchored contiguous prefixes

    # Hard cap on total queries per track
    "MAX_QUERIES_PER_TRACK": 200,
    # Generic parenthetical weighting (e.g., "(Ivory Re‑fire)")
    "GENERIC_PHRASE_MATCH_BONUS": 24,
    "GENERIC_PHRASE_PLAIN_PENALTY": 14,   # mild penalty for plain/original when a special phrase is requested and not matched
    "GENERIC_PHRASE_ORIG_PENALTY": 18,    # extra penalty for Original Mix when special phrase exists and a phrase-matching candidate is seen
    "GENERIC_PHRASE_EXT_PENALTY": 8,      # extra penalty for Extended Mix under same condition
    "GENERIC_PHRASE_STRICT_REJECT_TSIM": 96,
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

BASE_URL = "https://www.beatport.com"

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

try:
    import requests_cache  # type: ignore
    HAVE_CACHE = True
except Exception:
    HAVE_CACHE = False

def vlog(idx, *args):
    if SETTINGS["VERBOSE"]:
        print(f"[{idx}]  ", *args, flush=True)

def tlog(idx, *args):
    if SETTINGS["TRACE"]:
        print(f"[{idx}]    ", *args, flush=True)

# -----------------------------
# Utility
# -----------------------------
def timestamp_now():
    return time.strftime("%Y-%m-%d %H-%M-%S")

def with_timestamp(path: str) -> str:
    base, ext = os.path.splitext(path)
    ts = timestamp_now()
    return f"{base} ({ts}){ext or '.csv'}"

def startup_banner(script_path: str, args_namespace: argparse.Namespace):
    data = f"{script_path}|{sys.version}|{SETTINGS}|{args_namespace}"
    short = hashlib.sha1(data.encode("utf-8")).hexdigest()[:8]
    print(f"> Rekordbox->Beatport Enricher  |  {os.path.abspath(script_path)}", flush=True)
    print(f"  Python: {sys.version.split()[0]}  |  Seed: {SETTINGS['SEED']}  |  Fingerprint: {short}", flush=True)
    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        print("  Cache: enabled (requests-cache)", flush=True)
    print("", flush=True)

# -----------------------------
# Text helpers (with accent stripping)
# -----------------------------
def _strip_accents(s: str) -> str:
    if not s:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))

def normalize_text(s: str) -> str:
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
    if not artist_str:
        return []
    s = artist_str.replace(" feat. ", ", ").replace(" ft. ", ", ").replace(" featuring ", ", ")
    parts = re.split(r",|&|/| x | vs | with ", s, flags=re.IGNORECASE)
    return [normalize_text(p) for p in parts if normalize_text(p)]

def artists_similarity(a: str, b: str) -> int:
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
    t1 = normalize_text(title_a)
    t2 = normalize_text(title_b)
    title_sim = fuzz.token_set_ratio(t1, t2)
    artist_sim = artists_similarity(artists_a, artists_b)
    comp = SETTINGS["TITLE_WEIGHT"] * title_sim + SETTINGS["ARTIST_WEIGHT"] * artist_sim
    return title_sim, artist_sim, comp

def _artist_token_overlap(a: str, b: str) -> bool:
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

# Key near-equivalents
NEAR_KEYS = {
    "c#": {"db"}, "db": {"c#"},
    "d#": {"eb"}, "eb": {"d#"},
    "f#": {"gb"}, "gb": {"f#"},
    "g#": {"ab"}, "ab": {"g#"},
    "a#": {"bb"}, "bb": {"a#"},
}
def _norm_key(k: Optional[str]) -> Optional[str]:
    if not k: return None
    k = k.strip().lower()
    k = k.replace("maj", "major").replace("min", "minor").replace(" ", "")
    return k

# -----------------------------
# Remix & title helpers
# -----------------------------
def _extract_remix_phrases(original_title: str) -> List[str]:
    phrases = []
    for pat in (r'\(([^)]*remix[^)]*)\)', r'\[([^\]]*remix[^\]]*)\]'):
        for m in re.findall(pat, original_title, flags=re.I):
            ph = re.sub(r'\s+', ' ', m.strip())
            if ph:
                phrases.append(ph)
    out, seen = [], set()
    for p in phrases:
        k = p.lower()
        if k not in seen:
            seen.add(k); out.append(p)
    return out

def _extract_original_mix_phrases(original_title: str) -> List[str]:
    phrases = []
    # 1) Parenthesized/bracketed "Original Mix"
    for pat in (r'\(([^)]*original\s+mix[^)]*)\)', r'\[([^\]]*original\s+mix[^\]]*)\]'):
        for m in re.findall(pat, original_title, flags=re.I):
            ph = re.sub(r'\s+', ' ', m.strip())
            if ph:
                phrases.append(ph)
    # 2) Standalone "Original Mix" anywhere in the title (e.g., "… Original Mix")
    if re.search(r'\boriginal\s+mix\b', original_title or "", flags=re.I):
        phrases.append("Original Mix")
    # Dedup, preserve order
    out, seen = [], set()
    for p in phrases:
        k = p.lower()
        if k not in seen:
            seen.add(k); out.append(p)
    return out

def _extract_extended_mix_phrases(original_title: str) -> List[str]:
    phrases = []
    for pat in (r'\(([^)]*extended\s+mix[^)]*)\)', r'\[([^\]]*extended\s+mix[^\]]*)\]'):
        for m in re.findall(pat, original_title, flags=re.I):
            ph = re.sub(r'\s+', ' ', m.strip())
            if ph:
                phrases.append(ph)
    out, seen = [], set()
    for p in phrases:
        k = p.lower()
        if k not in seen:
            seen.add(k); out.append(p)
    return out

def _extract_generic_parenthetical_phrases(original_title: str) -> List[str]:
    """
    Return parenthesized/bracketed phrases that are NOT typical mix keywords,
    so we can prioritize queries like 'Burn For You (Ivory Re-fire)' even
    when they don't contain 'remix' or 'original mix'.
    """
    if not original_title:
        return []
    phrases: List[str] = []
    for pat in (r'\(([^)]{1,64})\)', r'\[([^\]]{1,64})\]'):
        for m in re.findall(pat, original_title, flags=re.I):
            ph = re.sub(r'\s+', ' ', m.strip())
            # Normalize dashes/hyphens inside the captured phrase (e.g., "Re–fire" → "Re-fire")
            ph = ph.replace("—", "-").replace("–", "-").replace("‐", "-")
            if not ph:
                continue
            if re.search(r'\b(feat\.?|ft\.?|featuring|original\s+mix|extended\s+mix|radio\s+edit|club\s+mix|remix|edit|version|vip|dub)\b', ph, flags=re.I):
                continue
            if re.fullmatch(r'[\d\s:\-\/]+', ph):
                continue
            phrases.append(ph)
    out, seen = [], set()
    for p in phrases:
        k = p.lower()
        if k not in seen:
            seen.add(k); out.append(p)
    return out

def _any_phrase_token_set_in_title(phrases: List[str], candidate_title: str) -> bool:
    """True if ANY phrase appears in candidate title either by token subset OR by collapsed form (spaces/hyphens removed)."""
    if not phrases or not candidate_title:
        return False

    def _collapse(s: str) -> str:
        s = normalize_text(s)
        s = s.replace(" ", "").replace("-", "").replace("/", "")
        return s

    cand_tokens = set(_word_tokens(candidate_title))
    cand_collapsed = _collapse(candidate_title)
    if not cand_tokens and not cand_collapsed:
        return False

    for ph in phrases:
        toks = set(_word_tokens(ph))
        if toks and toks.issubset(cand_tokens):
            return True
        ph_c = _collapse(ph)
        if ph_c and ph_c in cand_collapsed:
            return True
    return False

def _infer_special_mix_intent(phrases: List[str]) -> Dict[str, bool]:
    """Infer special 'mix intent' from generic parenthetical phrases, e.g. '(Ivory Re-fire)'."""
    want_refire = False
    want_rework = False
    for ph in phrases or []:
        n = normalize_text(ph)
        if re.search(r"\bre\s*[- ]?\s*fire\b", n) or re.search(r"\brefire\b", n):
            want_refire = True
        if re.search(r"\bre\s*[- ]?\s*work\b", n) or re.search(r"\brework\b", n):
            want_rework = True
    return {"want_refire": want_refire, "want_rework": want_rework}

def _extract_bracket_artist_hints(original_title: str) -> List[str]:
    hints = []
    for m in re.findall(r'\[([^\]]+)\]', original_title):
        token = m.strip()
        if not token:
            continue
        if re.search(r'\b(remix|edit|mix|version)\b', token, flags=re.I):
            continue
        if re.fullmatch(r'[\d\s\-]+', token):
            continue
        if len(token) <= 64:
            hints.append(token)
    out, seen = [], set()
    for h in hints:
        k = h.lower()
        if k not in seen:
            seen.add(k); out.append(h)
    return out

def _merge_name_lists(*names_lists: List[str]) -> str:
    out = []
    seen = set()
    for names in names_lists:
        for s in names:
            s = s.strip()
            if not s: continue
            if s.lower() not in seen:
                seen.add(s.lower()); out.append(s)
    return ", ".join(out)

def _split_display_names(s: str) -> List[str]:
    parts = re.split(r'\s*,\s*|\s*&\s*|\s+and\s+|/\s*', s)
    return [p.strip() for p in parts if p and p.strip()]

def _extract_remixer_names_from_title(title: str) -> List[str]:
    names = []
    # Extract from parenthetical remix patterns
    for m in re.findall(r'\(([^)]*?)\bremix\b[^)]*\)', title, flags=re.I):
        core = m
        parts = re.split(r',|&| and | x |/|\+', core, flags=re.I)
        for p in parts:
            p = re.sub(r'\b(remix|edit|version|mix)\b', '', p, flags=re.I)
            p = re.sub(r'\s{2,}', ' ', p).strip()
            if p and len(p) <= 64:
                names.append(p)
    
    # Also extract from bracket patterns like [Marco Generani remix]
    for m in re.findall(r'\[([^\]]*?)\bremix\b[^\]]*\]', title, flags=re.I):
        core = m
        parts = re.split(r',|&| and | x |/|\+', core, flags=re.I)
        for p in parts:
            p = re.sub(r'\b(remix|edit|version|mix)\b', '', p, flags=re.I)
            p = re.sub(r'\s{2,}', ' ', p).strip()
            if p and len(p) <= 64:
                names.append(p)
    
    # Also extract from bracket patterns without "remix" keyword like [Marco Generani]
    for m in re.findall(r'\[([^\]]+)\]', title):
        bracket_content = m.strip()
        # Skip if it looks like a number or single letter
        if not re.match(r'^[\d\s\-]+$', bracket_content) and len(bracket_content) > 1:
            # Check if it contains remix-related terms
            if re.search(r'\b(remix|edit|version|mix|rework|refire)\b', bracket_content, flags=re.I):
                parts = re.split(r',|&| and | x |/|\+', bracket_content, flags=re.I)
                for p in parts:
                    p = re.sub(r'\b(remix|edit|version|mix|rework|refire)\b', '', p, flags=re.I)
                    p = re.sub(r'\s{2,}', ' ', p).strip()
                    if p and len(p) <= 64:
                        names.append(p)

    # Fallback: detect "... <name> remix" without brackets (unicode-safe)
    t = re.sub(r'\s{2,}', ' ', title).strip()

    # First try a unicode-friendly class (handles letters like ä)
    m = re.search(r"([\w.+&' ]{2,64})\s+remix\b", t, flags=re.I)
    if not m:
        # Try again on accent-folded text (ä -> a) to catch cases like "Demayä"
        t_fold = _strip_accents(t)
        m = re.search(r"([A-Za-z0-9.+&' ]{2,64})\s+remix\b", t_fold, flags=re.I)

    if m:
        cand = m.group(1).strip()
        if not re.search(r'\b(original|extended|club|radio|edit|version|mix)\b', cand, flags=re.I):
            parts = [p for p in re.split(r'\s+', cand) if p]
            for tail in (3, 2, 1):
                if len(parts) >= tail:
                    guess = " ".join(parts[-tail:])
                    if len(guess) >= 2:
                        names.append(guess)
                        break

    out, seen = [], set()
    for nm in names:
        k = nm.lower()
        if k and k not in seen:
            seen.add(k); out.append(nm)
    return out

# ---- Mix-aware helpers ----
MIX_PATTERNS = {
    "original": re.compile(r"\boriginal\s+mix\b", re.I),
    "extended": re.compile(r"\bextended\s+mix\b", re.I),
    "club":     re.compile(r"\bclub\s+mix\b", re.I),
    "radio":    re.compile(r"\bradio\s+edit\b|\bradio\s+mix\b", re.I),
    "edit":     re.compile(r"\bedit\b", re.I),
    "remix":    re.compile(r"\bremix\b", re.I),
    "dub":      re.compile(r"\bdub\s+mix\b|\bdub\b", re.I),
    "guitar":   re.compile(r"\bguitar\s+mix\b|\bguitar\b", re.I),
    "vip":      re.compile(r"\bvip\b", re.I),
    "rework":   re.compile(r"\bre[-\s]?work\b", re.I),
    "refire":   re.compile(r"\bre[-\s]?fire\b", re.I),
    "acapella": re.compile(r"\bacapella\b", re.I),
    "instrumental": re.compile(r"\binstrumental\b", re.I),
}

def _parse_mix_flags(title: str) -> Dict[str, object]:
    """Extract mix-type booleans and normalized remixer tokens from a title string."""
    t = _strip_accents(html.unescape(title or "")).lower()
    t = t.replace("—", " ").replace("–", " ").replace("‐", " ").replace("-", " ")
    t = re.sub(r"\s+", " ", t).strip()
    flags = {
        "is_original": bool(MIX_PATTERNS["original"].search(t)),
        "is_extended": bool(MIX_PATTERNS["extended"].search(t)),
        "is_club":     bool(MIX_PATTERNS["club"].search(t)),
        "is_radio":    bool(MIX_PATTERNS["radio"].search(t)),
        "is_edit":     bool(MIX_PATTERNS["edit"].search(t)),
        "is_remix":    bool(MIX_PATTERNS["remix"].search(t)),
        "is_dub":      bool(MIX_PATTERNS["dub"].search(t)),
        "is_guitar":   bool(MIX_PATTERNS["guitar"].search(t)),
        "is_vip":      bool(MIX_PATTERNS["vip"].search(t)),
        "is_rework":   bool(MIX_PATTERNS["rework"].search(t)),
        "is_refire":   bool(MIX_PATTERNS["refire"].search(t)),
        "remixers":    [],
        "remixer_tokens": set(),
        "is_acapella": bool(MIX_PATTERNS["acapella"].search(t)),
        "is_instrumental": bool(MIX_PATTERNS["instrumental"].search(t)),
    }
    rems = _extract_remixer_names_from_title(title)
    flags["remixers"] = rems
    toks = set()
    for nm in rems:
        for w in re.split(r"\s+", normalize_text(nm)):
            if len(w) >= 2:
                toks.add(w)
    flags["remixer_tokens"] = toks

    has_any_mix_token = (
        flags["is_original"] or flags["is_extended"] or flags["is_club"] or
        flags["is_radio"] or flags["is_edit"] or flags["is_remix"] or
        flags["is_dub"] or flags["is_guitar"] or flags["is_vip"] or
        flags["is_rework"] or flags["is_refire"] or flags["is_acapella"] or flags["is_instrumental"]
    )

    flags["prefer_plain"] = not has_any_mix_token
    flags["is_plain"] = not has_any_mix_token
    return flags

def _mix_bonus(input_mix: Dict[str, object], cand_mix: Dict[str, object]) -> Tuple[int, str]:
    """Return (bonus, reason). Positive favors a consistent mix; negative penalizes mismatches."""
    bonus = 0
    reason = ""

    in_orig = bool(input_mix.get("is_original"))
    in_ext  = bool(input_mix.get("is_extended"))
    in_remx = bool(input_mix.get("is_remix"))
    prefer_plain = bool(input_mix.get("prefer_plain"))

    c_orig = bool(cand_mix.get("is_original"))
    c_ext  = bool(cand_mix.get("is_extended"))
    c_remx = bool(cand_mix.get("is_remix"))
    c_club = bool(cand_mix.get("is_club"))
    c_radio= bool(cand_mix.get("is_radio"))
    c_edit = bool(cand_mix.get("is_edit"))
    c_dub  = bool(cand_mix.get("is_dub"))
    c_guit = bool(cand_mix.get("is_guitar"))
    c_vip  = bool(cand_mix.get("is_vip"))
    c_alt  = c_dub or c_guit or c_vip

    if prefer_plain:
        if c_remx or c_alt or c_edit or c_radio:
            bonus -= 12
            if not reason: reason = "prefer_plain_penalize_alt"
        else:
            # Plain / Original / Extended are all fine; give a small nudge up
            bonus += 4
            if not reason: reason = "prefer_plain_bonus"

    if in_orig or in_ext:
        if (in_orig and c_orig) or (in_ext and c_ext):
            bonus += 6
            reason = reason or "mix_match"
        elif (in_orig and c_ext) or (in_ext and c_orig):
            bonus += 4  # treat Original↔Extended as compatible
            reason = reason or "mix_compatible_orig_ext"
        if c_alt:
            bonus -= 10
            reason = reason or "avoid_altmix"
        if c_club:
            bonus -= 2
            reason = reason or "avoid_club"
        if c_radio:
            bonus -= 3
            reason = reason or "avoid_radio"
        if c_edit:
            bonus -= 3
            reason = reason or "avoid_edit"
        if c_remx:
            bonus -= 6
            reason = reason or "avoid_remix_when_origext"
        if cand_mix.get("is_acapella") or cand_mix.get("is_instrumental"):
            bonus -= 8
            reason = reason or "avoid_stem_when_origext"

    if in_remx:
        if c_remx:
            itoks = input_mix.get("remixer_tokens", set())
            ctoks = cand_mix.get("remixer_tokens", set())
            if itoks:
                if itoks & ctoks:
                    bonus += 12; reason = "remixer_match"
                else:
                    bonus -= 6; reason = reason or "remixer_mismatch"
            else:
                bonus += 3; reason = reason or "any_remix_ok"
        else:
            bonus -= 4; reason = reason or "wanted_remix"

    if not (prefer_plain or in_orig or in_ext or in_remx):
        if c_alt:
            bonus -= 4
            reason = reason or "soft_avoid_altmix"

    return bonus, reason

def _mix_ok_for_early_exit(input_mix: Dict[str, object], cand_mix: Dict[str, object], cand_artists: str = "") -> bool:
    """Gate for early-exit: candidate must satisfy input mix intent if present.
    Also accepts a remixer match via candidate artists when title tokens are missing."""
    if not input_mix:
        return True
    # Original/Extended explicitly requested → accept original, extended, or plain (no explicit remix/alt)
    if input_mix.get("is_original") or input_mix.get("is_extended"):
        if cand_mix.get("is_original") or cand_mix.get("is_extended"):
            return True
        # treat plain titles (no explicit mix markers) as acceptable
        is_plain = not (cand_mix.get("is_remix") or cand_mix.get("is_dub") or cand_mix.get("is_vip")
                        or cand_mix.get("is_radio") or cand_mix.get("is_edit") or cand_mix.get("is_club"))
        return bool(is_plain)

    # Remix explicitly requested
    if input_mix.get("is_remix"):
        if not cand_mix.get("is_remix"):
            return False
        itoks = set(input_mix.get("remixer_tokens", set()))
        if itoks:
            ctoks = set(cand_mix.get("remixer_tokens", set()))
            # 1) Direct remixer token match from candidate title
            if itoks & ctoks:
                return True
            # 2) Fallback: remixer appears among candidate artists
            artist_tokens = set(re.split(r'\s+', normalize_text(cand_artists or "")))
            return bool(itoks & artist_tokens)
        # remix requested but no specific remixer given → accept any remix
        return True

    # No explicit mix intent → OK
    return True

# -----------------------------
# HTTP fetch
# -----------------------------
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

# -----------------------------
# Beatport parsing (structured first)
# -----------------------------
@dataclass
class BeatportCandidate:
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
    return bool(re.search(r"beatport\.com/track/[^/]+/\d+", u))

def _parse_structured_json_ld(soup: BeautifulSoup) -> Dict[str, str]:
    out = {}
    for tag in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            import json
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
    out = {}
    try:
        tag = soup.find("script", id="__NEXT_DATA__")
        if not tag or not tag.string:
            return out
        import json
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

# -----------------------------
# Search (DDG only)
# -----------------------------
def ddg_track_urls(idx: int, query: str, max_results: int) -> List[str]:
    """
    No final slice here — let per-track time budget and query cap be the guardrails.
    """
    urls: List[str] = []
    try:
        mr = max_results if max_results and max_results > 0 else 60
        ql = (query or "").lower()
        if (" remix" in ql) or ("extended mix" in ql) or ("re-fire" in ql) or ("refire" in ql) or ("rework" in ql) or ("re-edit" in ql) or ("(" in ql and ")" in ql) or re.search(r"\bstyler\b", ql):
            mr = max(mr, 120)
        with DDGS() as ddgs:
            for r in ddgs.text(f"site:beatport.com/track {query}", region="us-en", max_results=mr):
                href = r.get("href") or r.get("url") or ""
                if "beatport.com/track/" in href:
                    urls.append(href)
    except Exception as e:
        vlog(idx, f"[search] ddgs error: {e!r}")
        return []
    out, seen = [], set()
    for u in urls:
        if is_track_url(u) and u not in seen:
            seen.add(u); out.append(u)

    # Fallback: when few /track/ results, mine related Beatport pages for /track/ links
    try:
        LOW_TRACK_THRESHOLD = 4
        ql = (query or "").lower().strip()
        primary_tok = ql.split()[0] if ql else ""
        needs_fallback = len(out) < LOW_TRACK_THRESHOLD
        if primary_tok and len(primary_tok) >= 3:
            found_primary = any((primary_tok in u.lower()) for u in out)
            if not found_primary:
                needs_fallback = True
        if needs_fallback and (" " in ql):
            extra_pages: list[str] = []
            with DDGS() as ddgs:
                for r in ddgs.text(f"site:beatport.com {query}", region="us-en", max_results=20):
                    href = r.get("href") or r.get("url") or ""
                    if href and "beatport.com" in href:
                        extra_pages.append(href)
            for page_url in extra_pages[:6]:
                if "/track/" in page_url:
                    continue
                soup = request_html(page_url)
                if not soup:
                    continue
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

    if SETTINGS["TRACE"]:
        for i, u in enumerate(out, 1):
            tlog(idx, f"[cand {i}] {u}")
    return out

# -----------------------------
# Artist & title variant builder (Expanded)
# -----------------------------
def _ordered_unique(seq: List[str]) -> List[str]:
    seen = set(); out = []
    for s in seq:
        k = s.lower().strip()
        if k and k not in seen:
            seen.add(k); out.append(s.strip())
    return out

def _subset_join(tokens: List[str], max_r: Optional[int] = None) -> List[str]:
    if not tokens:
        return []
    out = []
    n = len(tokens)
    upper = n if max_r is None else min(max_r, n)
    for r in range(1, upper + 1):
        for comb in combinations(tokens, r):
            out.append(" ".join(comb))
    return _ordered_unique(out)

def _artist_tokens(a: str) -> List[str]:
    parts = re.split(
        r"\s*(?:,|&|/| x | vs | with | feat\.?| ft\.?| featuring )\s*",
        a, flags=re.IGNORECASE
    )
    tokens = [re.sub(r"\s{2,}", " ", p).strip() for p in parts if p and p.strip()]
    seen, unique = set(), []
    for tok in tokens:
        k = tok.lower()
        if k not in seen:
            seen.add(k); unique.append(tok)
    return unique

def _word_tokens(s: str) -> List[str]:
    s = normalize_text(s)
    toks = [t for t in re.split(r"\s+", s) if t]
    return toks

def _significant_tokens(s: str) -> List[str]:
    """Return normalized, meaningful tokens (>=3 chars, not common stopwords) for stricter title coverage guards."""
    STOP = {"the","a","an","and","of","to","for","in","on","with","vs","x",
            "feat","ft","featuring","mix","edit","remix","version","club","radio",
            "original","extended","vip","dub","rework","refire","re-fire"}
    toks = [t for t in re.split(r"\s+", normalize_text(s)) if t]
    return [t for t in toks if len(t) >= 3 and t not in STOP]

def _subset_strings(tokens: List[str]) -> List[str]:
    if not tokens:
        return []
    joins = [
        lambda xs: ", ".join(xs),
        lambda xs: " & ".join(xs),
        lambda xs: " and ".join(xs),
        lambda xs: " ".join(xs),
    ]
    out = []
    n = len(tokens)
    for r in range(1, n + 1):
        for comb in combinations(tokens, r):
            comb = list(comb)
            for j in joins:
                s = j(comb).strip()
                if s:
                    out.append(s)
    return out

def _title_ngrams_words(title_clean: str, max_n: int, stop_for_unigrams: set) -> Tuple[List[str], List[str], List[str]]:
    words_all = _word_tokens(title_clean)
    uni = [w for w in words_all if w not in stop_for_unigrams]
    bi = [" ".join(words_all[i:i+2]) for i in range(len(words_all)-1)] if max_n >= 2 else []
    tri = [" ".join(words_all[i:i+3]) for i in range(len(words_all)-2)] if max_n >= 3 else []
    def _dedup(seq):
        seen, out = set(), []
        for s in seq:
            k = s.lower()
            if k not in seen:
                seen.add(k); out.append(s)
        return out
    return _dedup(uni), _dedup(bi), _dedup(tri)

def _title_combos(tokens: List[str],
                  k_min: int = 2,
                  k_max: Optional[int] = None,
                  include_perms: bool = False,
                  perm_k_cap: int = 5) -> List[str]:
    n = len(tokens)
    if n == 0:
        return []
    if k_max is None or k_max > n:
        k_max = n
    results: List[str] = []
    for k in range(max(1, k_min), k_max + 1):
        for idxs in combinations(range(n), k):
            seq = [tokens[i] for i in idxs]
            s = " ".join(seq).strip()
            if s:
                results.append(s)
        if include_perms and k <= perm_k_cap:
            for token_subset in combinations(tokens, k):
                for p in permutations(token_subset, k):
                    s = " ".join(p).strip()
                    if s:
                        results.append(s)
    return _ordered_unique(results)

def _title_prefixes(tokens: List[str], k_min: int = 2, k_max: Optional[int] = None) -> List[str]:
    n = len(tokens)
    if n == 0:
        return []
    if k_max is None or k_max > n:
        k_max = n
    out = []
    for k in range(max(1, k_min), k_max + 1):
        if k <= n:
            s = " ".join(tokens[:k]).strip()
            if s:
                out.append(s)
    return _ordered_unique(out)

def make_search_queries(title: str, artists: str, original_title: Optional[str] = None) -> List[str]:
    """
    Build robust queries (deterministic, precision-first).

    Includes:
    • PRIORITY: Full title × ONE-artist, then Full title × TWO-artist subsets
    • Full title bases × artist variants (drop-one/many subsets, join styles)
    • Title n-grams (left-anchored prefixes if LINEAR_PREFIX_ONLY)
    • (Optional) Exhaustive title combos 2..N × artist subsets
    • Quoted/unquoted permutations (mostly disabled), optional reversed order, de-duplicated
    """
    def _Q(s: str) -> str:
        return (s or "").strip().strip('"').strip()

    def _ordered_unique_local(seq: List[str]) -> List[str]:
        seen = set(); out = []
        for s in seq:
            k = s.lower().strip()
            if k and k not in seen:
                seen.add(k); out.append(s.strip())
        return out

    def _artist_tokens_local(a: str) -> List[str]:
        parts = re.split(
            r"\s*(?:,|&|/| x | vs | with | feat\.?| ft\.?| featuring )\s*",
            a, flags=re.IGNORECASE
        )
        toks = [re.sub(r"\s{2,}", " ", p).strip() for p in parts if p and p.strip()]
        seen, unique = set(), []
        for tok in toks:
            k = tok.lower()
            if k not in seen:
                seen.add(k); unique.append(tok)
        return unique

    def _word_tokens_local(s: str) -> List[str]:
        s = normalize_text(s)
        return [t for t in re.split(r"\s+", s) if t]

    def _subset_space_join(tokens: List[str], max_r: Optional[int] = None) -> List[str]:
        if not tokens: return []
        out = []
        n = len(tokens)
        upper = n if max_r is None else min(max_r, n)
        for r in range(1, upper + 1):
            for comb in combinations(tokens, r):
                out.append(" ".join(comb))
        return _ordered_unique_local(out)
    
        # If artists are missing, try to extract them from the original_title (e.g., "Artist1 & Artist2 - Title (...)")
    if (not artists or not artists.strip()) and (original_title or "").strip():
        try:
            ext = extract_artists_from_title(original_title)
        except Exception:
            ext = None
        if ext:
            # ext = (artists_from_title, cleaned_title_without_artist_and_feat)
            artists = ext[0]
            # Only replace the working title if the passed-in title looks like it still contains artists
            if title and re.search(r"\b-\b", title):
                title = ext[1]

    STOP = {"the","a","an","and","of","to","for","in","on","with","vs","x","feat","ft","featuring","mix","edit","remix","version"}

    # ---------- title bases ----------
    t_clean = sanitize_title_for_search(title).strip()
    title_bases: List[str] = []
    
    # Generate multiple variations of the title for better matching
    title_variations = []
    if original_title and t_clean:
        # Original title variations
        title_variations.append(original_title)
        title_variations.append(t_clean)
        
        # Remove common prefixes/suffixes and try variations
        base_title = re.sub(r'^\[[\d\-\s]+\]\s*', '', original_title)  # Remove [1], [2-3], etc.
        base_title = re.sub(r'\s*\(F\)\s*', ' ', base_title)  # Remove (F) markers
        base_title = re.sub(r'\s*www\.[^\s]+\s*', ' ', base_title)  # Remove URLs
        base_title = re.sub(r'\s+', ' ', base_title).strip()
        if base_title != original_title:
            title_variations.append(base_title)
            title_variations.append(sanitize_title_for_search(base_title))
        
        generic_ph = _extract_generic_parenthetical_phrases(original_title)
        remix_ph   = _extract_remix_phrases(original_title)
        extmix_ph  = _extract_extended_mix_phrases(original_title)
        origmix_ph = _extract_original_mix_phrases(original_title)

        def _expand_generic_variants(ph: str) -> List[str]:
            variants = [ph]
            n = normalize_text(ph)
            try:
                if re.search(r"\bre\s*[- ]?\s*fire\b", n):
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*fire", "Re-fire", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*fire", "Refire", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*fire", "re fire", ph))
                if re.search(r"\bre\s*[- ]?\s*work\b", n):
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*work", "Re-work", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*work", "Rework", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*work", "re work", ph))
            except Exception:
                pass
            out, seen = [], set()
            for v in variants:
                vv = v.strip()
                if vv:
                    k = vv.lower()
                    if k not in seen:
                        seen.add(k); out.append(vv)
            return out

        generic_bases = []
        for ph in generic_ph:
            for v in _expand_generic_variants(ph):
                generic_bases.append(f"{t_clean} ({v})")

        # Build title_bases with multiple variations
        orig_present = bool(origmix_ph)
        title_bases = []
        
        # Add all title variations first
        for var in title_variations:
            if var and var.strip():
                title_bases.append(var.strip())
        
        if orig_present:
            for var in title_variations:
                if var and var.strip():
                    title_bases.append(f"{var.strip()} (Original Mix)")
        
        # Keep expanded special parentheticals (e.g., "Re-fire") high as well
        title_bases.extend(generic_bases)
        
        # Then explicit remixes and extended
        for var in title_variations:
            if var and var.strip():
                title_bases.extend([f"{var.strip()} ({ph})" for ph in remix_ph])
                title_bases.extend([f"{var.strip()} ({ph})" for ph in extmix_ph])
        
        # Also include any other original-mix phrases we captured (dedup below)
        for var in title_variations:
            if var and var.strip():
                title_bases.extend([f"{var.strip()} ({ph})" for ph in origmix_ph if ph.lower() != "original mix"])
    elif t_clean:
        title_bases = [t_clean]
    title_bases = _ordered_unique_local([b for b in title_bases if b.strip()])

    # Title grams (linear prefixes only if configured)
    words_all = _word_tokens_local(t_clean)
    if SETTINGS.get("LINEAR_PREFIX_ONLY", False):
        uni = [words_all[0]] if (words_all and SETTINGS.get("TITLE_GRAM_MAX", 3) >= 1 and words_all[0] not in STOP) else []
        bi  = _title_prefixes(words_all, k_min=2, k_max=2) if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 2 else []
        tri = _title_prefixes(words_all, k_min=3, k_max=3) if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 3 else []
    else:
        uni = [w for w in words_all if w not in STOP] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 1 else []
        bi  = [" ".join(words_all[i:i+2]) for i in range(len(words_all)-1)] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 2 else []
        tri = [" ".join(words_all[i:i+3]) for i in range(len(words_all)-2)] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 3 else []
    def _dedup(seq):
        seen, out = set(), []
        for s in seq:
            k = s.lower()
            if k and k not in seen:
                seen.add(k); out.append(s)
        return out
    grams_all = _dedup(uni + bi + tri)

    # ---------- artist variants & tokens ----------
    a_in = (artists or "").strip()
    a_variants: List[str] = []
    single_word_artist_tokens: List[str] = []
    toks: List[str] = []

    if a_in:
        a_norm = re.sub(r"\s*&\s*", " & ", a_in)
        a_norm = re.sub(r"\s*,\s*", ", ", a_norm)
        a_norm = re.sub(r"\s*/\s*", " / ", a_norm)
        a_norm = re.sub(r"\s{2,}", " ", a_norm).strip()

        toks = _artist_tokens_local(a_norm)

        a_variants.append(a_norm)
        a_variants.append(a_norm.replace("&", "and"))
        a_variants.append(re.sub(r"[,&/]", " ", a_norm))
        if toks:
            a_variants.append(" ".join(toks))
            if len(toks) >= 2:
                a_variants.append(" and ".join(toks))
                a_variants.append(" & ".join(toks[:2]))
                a_variants.append(" and ".join(toks[:2]))
        a_variants.append(re.sub(r",", " ", a_norm))
        a_variants.append(re.sub(r"/", " ", a_norm))

        if len(toks) == 2:
            a1, a2 = toks
            a_variants.extend([
                f"{a1}, {a2}", f"{a1} & {a2}", f"{a1} and {a2}", f"{a1} {a2}",
                f"{a2}, {a1}", f"{a2} & {a1}", f"{a2} and {a1}", f"{a2} {a1}",
            ])

        if len(toks) >= 2:
            joins = [
                lambda xs: ", ".join(xs),
                lambda xs: " & ".join(xs),
                lambda xs: " and ".join(xs),
                lambda xs: " ".join(xs),
            ]
            for r in range(1, len(toks) + 1):
                for comb in combinations(toks, r):
                    for j in joins:
                        a_variants.append(j(list(comb)))

        for tok in toks:
            parts = [p for p in re.split(r"\s+", tok.strip()) if len(p) >= 2]
            single_word_artist_tokens.extend(parts)
            if len(parts) >= 2:
                single_word_artist_tokens.append(parts[-1])

        if original_title:
            a_variants.extend(_extract_bracket_artist_hints(original_title))

        remixers_from_title = _extract_remixer_names_from_title(original_title or "")
        remixer_variants: List[str] = []
        for rname in remixers_from_title:
            rn = (rname or "").strip()
            if rn:
                remixer_variants.append(rn)
                remixer_variants.append(f"{rn} remix")
        a_variants = _ordered_unique_local(remixer_variants + a_variants)
        remixer_hint_set = set(v.lower().strip() for v in remixer_variants)

        if SETTINGS.get("ALLOW_GENERIC_ARTIST_REMIX_HINTS", False) and _parse_mix_flags(original_title or "").get("is_remix"):
            for tok in toks:
                a_variants.append(f"{tok} remix")

        a_variants = _ordered_unique_local([re.sub(r"\s{2,}", " ", v).strip() for v in a_variants if v.strip()])
    else:
        a_variants = [""]  # title-only fallback

    artist_space_subsets = _subset_space_join(toks, max_r=len(toks)) if toks else []

    # ---------- assemble queries ----------
    queries: List[str] = []
    seenq = set()
    def _add(q: str):
        k = q.lower().strip()
        if k and k not in seenq:
            seenq.add(k); queries.append(q.strip())

    # PRIORITY STAGE 0: Full title + "<remixer> remix" first (fast path)
    try:
        remixers_from_title  # noqa
    except NameError:
        remixers_from_title = _extract_remixer_names_from_title(original_title or "")
    if remixers_from_title:
        for tb in title_bases:
            for r in remixers_from_title:
                # Generate multiple remix query variations
                rr_variants = [
                    f"{r} remix",
                    f"{r} remix original mix",  # Sometimes remixes are labeled as "Original Mix"
                    f"{r} extended remix",
                    f"{r} extended mix",
                    f"{r} club remix",
                    f"{r} club mix"
                ]
                for rr in rr_variants:
                    if rr.strip():
                        _add(f"{tb} {rr}")
                        if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_REMIX_HINTS", True):
                            _add(f"{rr} {tb}")

    # PRIORITY STAGE: Full title + ONE artist, then + TWO-artist subsets
    single_artists = toks[:] + (remixers_from_title[:] if remixers_from_title else [])
    two_artist_pairs: List[Tuple[str, str]] = []
    if len(toks) >= 2:
        two_artist_pairs.extend(list(combinations(toks, 2)))
    for r in remixers_from_title or []:
        for a in toks:
            two_artist_pairs.append((r, a))
    seen_pairs = set()
    two_artist_subsets = []
    for a1, a2 in two_artist_pairs:
        key = (a1.lower().strip(), a2.lower().strip())
        if key not in seen_pairs:
            seen_pairs.add(key); two_artist_subsets.append((a1, a2))

    for tb in title_bases:
        tb_tokens = _word_tokens(tb)
        has_parens = ("(" in tb) or (")" in tb)
        single_word_title = len(tb_tokens) == 1
        tb_q = f'"{tb}"' if (SETTINGS.get("QUOTED_TITLE_VARIANT", False) and (has_parens or single_word_title)) else None

        for a in single_artists:
            _add(f"{tb} {a}")
            _add(f"{_Q(tb)} {a}")
            if tb_q: _add(f"{tb_q} {a}")
            if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_ORDER_QUERIES", False):
                _add(f"{a} {tb}")
                _add(f"{a} {_Q(tb)}")
                if tb_q: _add(f"{a} {tb_q}")

        for (a1, a2) in two_artist_subsets:
            for a in (f"{a1} {a2}", f"{a1} & {a2}"):
                _add(f"{tb} {a}")
                _add(f"{_Q(tb)} {a}")
                if tb_q: _add(f"{tb_q} {a}")
                if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_ORDER_QUERIES", False):
                    _add(f"{a} {tb}")
                    _add(f"{a} {_Q(tb)}")
                    if tb_q: _add(f"{a} {tb_q}")

    # (1) Full title bases × artist variants (+ reverse when remixer hint)
    for tb in title_bases:
        for av in a_variants:
            if av:
                for q in (f"{tb} {av}", f"{tb} {_Q(av)}", f"{_Q(tb)} {av}", f"{_Q(tb)} {_Q(av)}"):
                    _add(q)
                allow_rev = SETTINGS.get("REVERSE_ORDER_QUERIES", False)
                if (not allow_rev) and SETTINGS.get("REVERSE_REMIX_HINTS", True):
                    av_key = av.lower().strip()
                    if (av_key in (set(v.lower().strip() for v in remixers_from_title or []) | set([v.lower().strip() for v in a_variants if ' remix' in v.lower()]))) or re.search(r"\bremix\b", av_key, flags=re.I):
                        allow_rev = True
                if allow_rev:
                    for q in (f"{av} {tb}", f"{_Q(av)} {tb}", f"{av} {_Q(tb)}", f"{_Q(av)} {_Q(tb)}"):
                        _add(q)
            else:
                if (not a_in) or (not SETTINGS.get("FULL_TITLE_WITH_ARTIST_ONLY", False)):
                    for q in (tb, _Q(tb)):
                        _add(q)

    # (2) Grams only when FULL_TITLE_WITH_ARTIST_ONLY is False
    if not SETTINGS.get("FULL_TITLE_WITH_ARTIST_ONLY", False):
        for g in grams_all:
            for q in (g, _Q(g)):
                _add(q)
        
        # For complex titles, also try individual significant words
        if len(words_all) >= 3:  # Only for longer titles
            significant_words = [w for w in words_all if len(w) >= 4 and w not in STOP]
            for word in significant_words[:3]:  # Limit to first 3 significant words
                for av in a_variants:
                    if av:
                        _add(f"{word} {av}")
                        _add(f"{av} {word}")

        if SETTINGS.get("CROSS_TITLE_GRAMS_WITH_ARTISTS", True):
            if SETTINGS.get("CROSS_SMALL_ONLY", True):
                uni_small = [w for w in words_all if w not in STOP]
                bi_small  = [" ".join(words_all[i:i+2]) for i in range(len(words_all)-1)]
                cross_grams = _dedup(uni_small + bi_small)
            else:
                cross_grams = grams_all

            for g in cross_grams:
                for av in a_variants:
                    if not av:
                        continue
                    for q in (f"{g} {av}", f"{_Q(g)} {av}", f"{g} {_Q(av)}", f"{_Q(g)} {_Q(av)}"):
                        _add(q)
                    if SETTINGS.get("REVERSE_ORDER_QUERIES", False):
                        for q in (f"{av} {g}", f"{_Q(av)} {g}", f"{av} {_Q(g)}", f"{_Q(av)} {_Q(g)}"):
                            _add(q)

            sw_tokens = _ordered_unique([t for t in single_word_artist_tokens if t])
            for g in cross_grams:
                for sw in sw_tokens:
                    for q in (f"{g} {sw}", f"{_Q(g)} {sw}", f"{sw} {g}", f"{sw} {_Q(g)}"):
                        _add(q)

    # (3) Exhaustive linear combos (optional) × artist subsets
    if SETTINGS.get("RUN_EXHAUSTIVE_COMBOS", False) and (not SETTINGS.get("FULL_TITLE_WITH_ARTIST_ONLY", False)):
        tokens = words_all
        k_min = int(SETTINGS.get("TITLE_COMBO_MIN_LEN", 2) or 2)
        k_max = SETTINGS.get("TITLE_COMBO_MAX_LEN", None)
        combos = _title_prefixes(tokens, k_min=k_min, k_max=k_max)
        artist_tokens = _ordered_unique([t for t in single_word_artist_tokens if t])
        if artist_tokens:
            m = max(1, int(SETTINGS.get("ARTIST_WORD_SUBSET_MAX", 2)))
            subsets = _ordered_unique([" ".join(c) for r in range(1, min(m, len(artist_tokens)) + 1)
                                    for c in combinations(artist_tokens, r)])
        else:
            subsets = [""]

        use_quoted = bool(SETTINGS.get("QUOTED_TITLE_VARIANT", False))
        rev = bool(SETTINGS.get("REVERSE_ORDER_QUERIES", False))
        maxq = SETTINGS.get("MAX_COMBO_QUERIES", None)
        added = 0

        for tc in combos:
            tc_q = f"\"{tc}\"" if use_quoted else tc
            for a in subsets:
                if a:
                    _add(f"{tc} {a}")
                    if use_quoted: _add(f"{tc_q} {a}")
                    if rev:
                        _add(f"{a} {tc}")
                        if use_quoted: _add(f"{a} {tc_q}")
                else:
                    _add(tc)
                    if use_quoted: _add(tc_q)
                added += 1
                if maxq is not None and added >= maxq:
                    break
            if maxq is not None and added >= maxq:
                break

    # Generate additional query variations for better discovery
    additional_queries = []
    
    # For tracks with complex titles, try simplified versions
    if original_title and len(_word_tokens_local(original_title)) >= 4:
        # Try removing brackets and parentheticals
        simplified_title = re.sub(r'[\[\(][^\]\)]*[\]\)]', '', original_title)
        simplified_title = re.sub(r'\s+', ' ', simplified_title).strip()
        if simplified_title and simplified_title != original_title:
            for av in a_variants:
                if av:
                    additional_queries.append(f"{simplified_title} {av}")
                    additional_queries.append(f"{av} {simplified_title}")
    
    # For tracks with Hebrew or special characters, try transliterated versions
    if original_title and re.search(r'[^\x00-\x7F\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]', original_title):
        # Try with transliterated characters
        transliterated = original_title
        transliterated = transliterated.replace('א', 'a').replace('ב', 'b').replace('ג', 'g').replace('ד', 'd')
        transliterated = transliterated.replace('ה', 'h').replace('ו', 'v').replace('ז', 'z').replace('ח', 'ch')
        transliterated = transliterated.replace('ט', 't').replace('י', 'y').replace('כ', 'k').replace('ל', 'l')
        transliterated = transliterated.replace('מ', 'm').replace('נ', 'n').replace('ס', 's').replace('ע', 'a')
        transliterated = transliterated.replace('פ', 'p').replace('צ', 'ts').replace('ק', 'q').replace('ר', 'r')
        transliterated = transliterated.replace('ש', 'sh').replace('ת', 't')
        transliterated = re.sub(r'\s+', ' ', transliterated).strip()
        if transliterated and transliterated != original_title:
            for av in a_variants:
                if av:
                    additional_queries.append(f"{transliterated} {av}")
                    additional_queries.append(f"{av} {transliterated}")
    
    # For tracks with complex bracketed titles, try core title extraction
    if original_title and ('[' in original_title or '(' in original_title):
        # Extract the core title by removing all brackets and parentheticals
        core_title = re.sub(r'[\[\(][^\]\)]*[\]\)]', '', original_title)
        core_title = re.sub(r'\s+', ' ', core_title).strip()
        if core_title and len(core_title) >= 3 and core_title != original_title:
            for av in a_variants:
                if av:
                    additional_queries.append(f"{core_title} {av}")
                    additional_queries.append(f"{av} {core_title}")
    
    # For tracks with complex titles like "[3] (F) Never Sleep Again (Keinemusik Remix)", try simplified versions
    if original_title and re.search(r'^\[[\d\-\s]+\]\s*\([^)]*\)\s*', original_title):
        # Remove leading [number] and (F) patterns
        simplified = re.sub(r'^\[[\d\-\s]+\]\s*\([^)]*\)\s*', '', original_title)
        simplified = re.sub(r'\s+', ' ', simplified).strip()
        if simplified and len(simplified) >= 3 and simplified != original_title:
            for av in a_variants:
                if av:
                    additional_queries.append(f"{simplified} {av}")
                    additional_queries.append(f"{av} {simplified}")
    
    # For tracks with complex titles like "Spectrum (Say my name) [Marco Generani remix]", try different parsing
    if original_title and '[' in original_title and ']' in original_title:
        # Extract title before brackets
        before_brackets = original_title.split('[')[0].strip()
        if before_brackets and len(before_brackets) >= 3:
            for av in a_variants:
                if av:
                    additional_queries.append(f"{before_brackets} {av}")
                    additional_queries.append(f"{av} {before_brackets}")
        
        # Extract remixer from brackets
        bracket_match = re.search(r'\[([^\]]*remix[^\]]*)\]', original_title, flags=re.I)
        if bracket_match:
            remixer = bracket_match.group(1).strip()
            if remixer:
                for av in a_variants:
                    if av:
                        additional_queries.append(f"{before_brackets} {remixer} {av}")
                        additional_queries.append(f"{av} {before_brackets} {remixer}")
    
    # Add additional queries to the main list
    for q in additional_queries:
        _add(q)

    return queries

# -----------------------------
# Rekordbox XML
# -----------------------------
@dataclass
class RBTrack:
    track_id: str
    title: str
    artists: str

def parse_rekordbox(xml_path: str) -> Tuple[Dict[str, RBTrack], Dict[str, List[str]]]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    tracks_by_id: Dict[str, RBTrack] = {}
    playlists: Dict[str, List[str]] = {}

    collection = root.find(".//COLLECTION")
    if collection is not None:
        for t in collection.findall("TRACK"):
            tid = t.get("TrackID") or t.get("ID") or t.get("Key") or ""
            title = t.get("Name") or t.get("Title") or ""
            artists = t.get("Artist") or t.get("Artists") or ""
            if tid and title:
                tracks_by_id[tid] = RBTrack(track_id=tid, title=title, artists=artists)

    playlists_root = root.find(".//PLAYLISTS")
    if playlists_root is not None:
        for node in playlists_root.findall(".//NODE"):
            typ = (node.get("Type") or node.get("type") or "").strip()
            if typ == "1":  # playlist
                pname = node.get("Name") or node.get("name") or "Unnamed Playlist"
                track_ids: List[str] = []
                for tr in node.findall("./TRACK"):
                    ref = tr.get("Key") or tr.get("TrackID") or tr.get("ID")
                    if ref:
                        track_ids.append(ref)
                if track_ids:
                    playlists[pname] = track_ids

    return tracks_by_id, playlists

# -----------------------------
# Artist-from-title extraction
# -----------------------------
def extract_artists_from_title(title: str) -> Optional[Tuple[str, str]]:
    if not title:
        return None
    t = title.strip()
    t = re.sub(r'^\s*(?:[\[(]?\d+[\])\.]?|\(F\))\s*[-–—:\s]\s*', '', t, flags=re.I)
    parts = re.split(r'\s*[-–—:]\s*', t, maxsplit=1)
    if len(parts) != 2:
        return None
    artists, rest = parts[0].strip(), parts[1].strip()
    rest = re.sub(r'\s*\((?:feat\.?|ft\.?|featuring)\s+[^\)]*\)', ' ', rest, flags=re.I)
    rest = re.sub(r'\s*\[(?:feat\.?|ft\.?|featuring)\s+[^\]]*\]', ' ', rest, flags=re.I)
    rest = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', rest)
    rest = re.sub(r'\s{2,}', ' ', rest).strip()
    return (artists, rest) if (artists and rest) else None

# -----------------------------
# Matching (DDG only) & guardrails
# -----------------------------
def _year_bonus(input_year: Optional[int], cand_year: Optional[int]) -> int:
    if not input_year or not cand_year:
        return 0
    if cand_year == input_year:
        return 2
    if abs(cand_year - input_year) == 1:
        return 1
    return 0

def _key_bonus(input_key: Optional[str], cand_key: Optional[str]) -> int:
    a, b = _norm_key(input_key), _norm_key(cand_key)
    if not a or not b:
        return 0
    if a == b:
        return 2
    if a in NEAR_KEYS and b in NEAR_KEYS[a]:
        return 1
    return 0

def _camelot_key(key: Optional[str]) -> str:
    """Convert 'E Major' / 'E Minor' (incl. ♭/♯ and enharmonics) to Camelot like '12B'/'9A'."""
    if not key:
        return ""
    s = (key or "").strip()
    if not s:
        return ""
    # Normalize accidentals and spacing
    s = s.replace("♭", "b").replace("♯", "#")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("–", "-").replace("—", "-").strip()
    # Normalize quality tokens
    s = re.sub(r"(?i)\bmaj(?:or)?\b", "Major", s)
    s = re.sub(r"(?i)\bmin(?:or)?\b", "Minor", s)

    m = re.match(r"^\s*([A-G])\s*(#|b)?\s*(major|minor)\s*$", s, flags=re.I)
    if m:
        letter = m.group(1).upper()
        acc = m.group(2) or ""
        qual = "Major" if m.group(3).lower() == "major" else "Minor"
        note = letter + acc
    else:
        note, qual = None, None

    cam = {
        # Majors
        ("A",  "Major"): "11B",
        ("Ab", "Major"): "4B",  ("G#", "Major"): "4B",
        ("B",  "Major"): "1B",
        ("Bb", "Major"): "6B",  ("A#", "Major"): "6B",
        ("C",  "Major"): "8B",
        ("C#", "Major"): "3B",  ("Db", "Major"): "3B",
        ("D",  "Major"): "10B",
        ("Eb", "Major"): "5B",  ("D#", "Major"): "5B",
        ("E",  "Major"): "12B",
        ("F",  "Major"): "7B",
        ("F#", "Major"): "2B",  ("Gb", "Major"): "2B",
        ("G",  "Major"): "9B",

        # Minors
        ("A",  "Minor"): "8A",
        ("Ab", "Minor"): "1A",  ("G#", "Minor"): "1A",
        ("B",  "Minor"): "10A",
        ("Bb", "Minor"): "3A",  ("A#", "Minor"): "3A",
        ("C",  "Minor"): "5A",
        ("C#", "Minor"): "12A", ("Db", "Minor"): "12A",
        ("D",  "Minor"): "7A",
        ("Eb", "Minor"): "2A",  ("D#", "Minor"): "2A",
        ("E",  "Minor"): "9A",
        ("F",  "Minor"): "4A",
        ("F#", "Minor"): "11A", ("Gb", "Minor"): "11A",
        ("G",  "Minor"): "6A",
    }

    if note and qual:
        return cam.get((note, qual), "")
    # Last-chance fallback: try direct lookup on already-normalized string
    try:
        parts = s.split()
        if len(parts) == 2:
            n, q = parts[0], parts[1].title()
            return cam.get((n, q), "")
    except Exception:
        pass
    return ""

@dataclass
class MatchRow:
    playlist_index: int
    row: Dict[str, str]

def _confidence_label(score: float) -> str:
    return "high" if score >= 95 else "med" if score >= 85 else "low"

def best_beatport_match(
    idx: int,
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    queries: List[str],
    input_year: Optional[int]=None,
    input_key: Optional[str]=None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int,str,int,int]], int]:
    start = time.perf_counter()
    best: Optional[BeatportCandidate] = None
    candidates_log: List[BeatportCandidate] = []
    queries_audit: List[Tuple[int,str,int,int]] = []  # (qidx, qtext, num_candidates, elapsed_ms)
    last_q_processed = 0  # track last processed query index for CSVs

    # Per-track caches: avoid re-fetching the same URL across queries
    parsed_cache: Dict[str, Tuple[str, str, Optional[str], Optional[int], Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]] = {}
    visited_urls: set[str] = set()

    # Base title (sanitized) and artist word tokens for family detection
    base_title_clean = sanitize_title_for_search(track_title).strip().lower()
    artist_word_set = set()
    for tok in _artist_tokens(track_artists_for_scoring or ""):
        for w in re.split(r"\s+", normalize_text(tok)):
            if len(w) >= 2:
                artist_word_set.add(w)

    def _is_full_title_plus_one_artist_query(q: str) -> bool:
        """Heuristic: query starts with the full title (quoted or unquoted), optionally
        followed by a parenthetical like (Original Mix)/(Extended Mix)/(generic phrase),
        and then exactly one artist word.
        Accepts both quoted and unquoted title prefixes.
        """
        if not base_title_clean:
            return False
        ql = (q or "").lower().strip()

        # Build acceptable title prefixes: base, base (original mix), base (extended mix), base (generic_phrase)
        phrases = ["original mix", "extended mix"]
        for p in (input_generic_phrases or []):
            pp = normalize_text(p)
            if pp:
                phrases.append(pp)
        prefixes = [base_title_clean]
        prefixes.extend([f"{base_title_clean} ({ph})" for ph in dict.fromkeys(phrases)])

        def _match_with_prefix(prefix: str) -> bool:
            # allow quoted or unquoted
            candidates = [prefix, f'"{prefix}"', f"'{prefix}'"]
            for bt in candidates:
                if ql.startswith(bt + " "):
                    tail = ql[len(bt):].strip()
                    m = re.match(r"^([a-z0-9'+.&-]{2,})\b", tail)
                    if m:
                        w = normalize_text(m.group(1))
                        return w in artist_word_set
            return False

        for pref in prefixes:
            if _match_with_prefix(pref):
                return True
        return False

    def _pick_max_results_for_query(q: str) -> int:
        """Adaptive max_results based on query shape and prior scarcity."""
        if not SETTINGS.get("ADAPTIVE_MAX_RESULTS", True):
            return int(SETTINGS.get("MAX_SEARCH_RESULTS", 50))
        ql = (q or "").lower()
        has_phrase = ("(" in ql and ")" in ql)
        has_mix = any(x in ql for x in [" remix", "extended mix", "original mix", "dub mix", " re-fire", " refire", " rework"])
        family_full_plus_one = _is_full_title_plus_one_artist_query(q)

        # If we have seen very few unique track URLs so far, be generous
        scarcity = len(visited_urls) < 6

        # If explicitly searching Original Mix, keep MR at MED to reduce noise
        if "original mix" in ql:
            return int(SETTINGS.get("MR_MED", 40))
        if has_mix or has_phrase or family_full_plus_one:
            return int(SETTINGS.get("MR_HIGH", 100)) if scarcity else int(SETTINGS.get("MR_MED", 40))
        # Low-signal grams/combos fall back to low MR
        return int(SETTINGS.get("MR_LOW", 10))

    # If a special phrase exists, don't steer toward "plain"
    effective_input_mix = dict(input_mix or {})
    if input_generic_phrases:
        effective_input_mix["prefer_plain"] = False

    special_intent = _infer_special_mix_intent(input_generic_phrases or [])
    seen_generic_match = False
    best_is_family_shape = False

    def title_mentions_input_remix(cand_title: str, input_artists: str) -> bool:
        ct = normalize_text(cand_title)
        toks = _artist_tokens(input_artists)
        for tok in toks:
            tok_n = normalize_text(tok)
            if not tok_n: continue
            if re.search(rf'\b{re.escape(tok_n)}\b\s+remix\b', ct, flags=re.I):
                return True
        return False

    def consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, qidx, qtext, cidx, elapsed_ms):
        nonlocal best, seen_generic_match, best_is_family_shape
        ok = True
        reject_reason = ""
        t_sim, a_sim, comp = score_components(track_title, track_artists_for_scoring, title, artists or "")

        # Short-title stricter floor: for 1–2 significant tokens, require a very high title_sim
        in_sig_short = _significant_tokens(track_title)
        if 1 <= len(in_sig_short) <= 2:
            if t_sim < 95:
                ok = False
                reject_reason = "guard_short_title_high_floor"

        # --- Title token coverage guard (prevents e.g., "For You" being chosen for "Burn For You") ---
        in_sig = _significant_tokens(track_title)
        cand_sig = _significant_tokens(title or "")
        if len(in_sig) >= 2:
            shared = set(in_sig) & set(cand_sig)
            coverage = len(shared) / max(1, len(in_sig))
            # Much more lenient: allow lower coverage if title similarity is high or artist match is perfect
            if coverage < 0.5 and t_sim < 90 and a_sim < 95:  # Lowered thresholds significantly
                ok = False
                reject_reason = "guard_title_token_coverage"

        # --- Anchored prefix guard: require the first two meaningful tokens to appear in order (unless near-exact) ---
        # --- Anchored prefix guard: require first token, and if possible first two in order (unless near-exact) ---
        if ok:
            in_words = [w for w in _word_tokens(track_title) if w]
            cand_words = _word_tokens(title or "")
            if len(in_words) >= 2:
                first_two = in_words[:2]
                try:
                    i0 = cand_words.index(first_two[0])
                    found_order = first_two[1] in cand_words[i0+1:]
                except ValueError:
                    found_order = False
                # Much more lenient: only reject if title similarity is very low
                if not found_order and t_sim < 85:  # Lowered from 97
                    ok = False
                    reject_reason = reject_reason or "guard_anchored_prefix"
            elif len(in_words) == 1:
                if (in_words[0] not in cand_words) and t_sim < 85:  # Lowered from 97
                    ok = False
                    reject_reason = reject_reason or "guard_anchored_prefix_single"

        bp_artist_count = len([x for x in re.split(r',|&| and ', (artists or ""), flags=re.I) if x.strip()])
        in_artist_count = len([x for x in re.split(r',|&|/| x | vs | with ', (track_artists_for_scoring or ""), flags=re.I) if x.strip()])
        if bp_artist_count >= 6 and in_artist_count <= 2:
            comp *= 0.92  # 8% penalty

        bias = 0
        if in_artist_count <= 2:
            if 3 <= bp_artist_count <= 5:
                bias -= 2
            elif bp_artist_count <= 2 and abs(bp_artist_count - in_artist_count) <= 1:
                bias += 1

        yb = _year_bonus(input_year, year)
        kb = _key_bonus(input_key, key)

        cand_mix = _parse_mix_flags(title or "")
        mix_bonus, _mix_reason = _mix_bonus(effective_input_mix, cand_mix)

        # Strict remix guards (moved here to run right after cand_mix is available, before bonuses/final)
        if input_mix and input_mix.get("is_remix"):
            if not cand_mix.get("is_remix"):
                ok = False
                reject_reason = reject_reason or "wanted_remix"
            else:
                itoks = input_mix.get("remixer_tokens", set())
                ctoks = cand_mix.get("remixer_tokens", set())
                cand_artist_tokens = set(re.split(r'\s+', normalize_text(artists or "")))
                if itoks and not ((itoks & ctoks) or (itoks & cand_artist_tokens)):
                    if not (t_sim >= 97 and a_sim >= 70):
                        ok = False
                        reject_reason = reject_reason or "remixer_mismatch_guard"
                
                # When a specific remixer is requested, avoid edits/radio/club/vip even more aggressively
                if itoks and (cand_mix.get("is_edit") or cand_mix.get("is_radio") or cand_mix.get("is_club") or cand_mix.get("is_vip")):
                    if not (t_sim >= 99 and a_sim >= 88):
                        ok = False
                        reject_reason = reject_reason or "unwanted_edit_under_specific_remix"

        # Require at least one original-artist token on candidate artists when remix intent is present
        if ok and input_mix and input_mix.get("is_remix"):
            original_artist_tokens = set()
            for tok in _artist_tokens(track_artists_for_scoring or ""):
                for w in re.split(r"\s+", normalize_text(tok)):
                    if len(w) >= 2:
                        original_artist_tokens.add(w)
            cand_artist_tokens = set(re.split(r"\s+", normalize_text(artists or "")))
            if original_artist_tokens and not (original_artist_tokens & cand_artist_tokens) and t_sim < 97:
                ok = False
                reject_reason = reject_reason or "guard_missing_original_artist_in_remix"

        special_bonus = 0
        if special_intent.get("want_refire"):
            if cand_mix.get("is_refire"):
                special_bonus += 12
            elif cand_mix.get("is_original") or cand_mix.get("is_extended"):
                special_bonus -= 5
        if special_intent.get("want_rework"):
            if cand_mix.get("is_rework"):
                special_bonus += 8
            elif cand_mix.get("is_original") or cand_mix.get("is_extended"):
                special_bonus -= 4

        gen_bonus = 0
        matched_generic = False
        if input_generic_phrases:
            try:
                matched_generic = _any_phrase_token_set_in_title(input_generic_phrases, title or "")
                if matched_generic:
                    gen_bonus += SETTINGS.get("GENERIC_PHRASE_MATCH_BONUS", 24)
                else:
                    # Mild nudge away from plain/original/extended when special phrase intent exists
                    if cand_mix.get("is_original") or cand_mix.get("is_extended") or not (
                        cand_mix.get("is_remix") or cand_mix.get("is_dub") or cand_mix.get("is_rework") or cand_mix.get("is_refire")
                    ):
                        gen_bonus -= SETTINGS.get("GENERIC_PHRASE_PLAIN_PENALTY", 14)
            except Exception:
                pass

        final = comp + yb + kb + bias + mix_bonus + gen_bonus + special_bonus

        # Prefer candidates whose significant token count matches the input's (breaks ties like Sun vs Son of Sun)
        try:
            _in_sig_n = len(_significant_tokens(track_title))
            _cd_sig_n = len(_significant_tokens(title or ""))
            if _cd_sig_n == _in_sig_n and t_sim >= 96:
                final += 1.5
        except Exception:
            pass
        # If input requests a remix and we have strong title match + remixer token match, give a decisive nudge
        if input_mix and input_mix.get("is_remix"):
            itoks = set(input_mix.get("remixer_tokens", set()))
            ctoks = set(cand_mix.get("remixer_tokens", set()))
            if itoks and t_sim >= 96 and (itoks & ctoks):
                final += 6

        # If a special parenthetical was provided and we've already seen a phrase-matching candidate,
        # heavily penalize plain/original/extended results that don't match that phrase.
        if input_generic_phrases and (not matched_generic) and seen_generic_match:
            if cand_mix.get("is_original"):
                final -= SETTINGS.get("GENERIC_PHRASE_ORIG_PENALTY", 18)
            elif cand_mix.get("is_extended"):
                final -= SETTINGS.get("GENERIC_PHRASE_EXT_PENALTY", 8)
            # Guard: reject plain original/extended unless it's virtually an exact title match
            if (cand_mix.get("is_original") or cand_mix.get("is_extended")) and t_sim < SETTINGS.get("GENERIC_PHRASE_STRICT_REJECT_TSIM", 96):
                ok = False
                reject_reason = reject_reason or "wanted_special_phrase"
        
        # --- Strict-subset guard: reject if candidate's tokens are a strict subset of input's ---
        if ok:
            in_sig = set(_significant_tokens(track_title))
            cand_sig = set(_significant_tokens(title or ""))
            if len(in_sig) >= 2 and cand_sig and cand_sig < in_sig:
                # Only allow if it's an exact normalized string match; otherwise reject
                if fuzz.token_set_ratio(normalize_text(track_title), normalize_text(title or "")) < 100:
                    ok = False
                    reject_reason = reject_reason or "guard_title_strict_subset"
                    
        if title_only_mode:
            strong = t_sim >= 90
            near = (t_sim >= 88 and len(track_title.strip()) >= 10)
            if not (strong or near):
                ok = False; reject_reason = "title_only_too_low"
        else:
            overlap = _artist_token_overlap(track_artists_for_scoring, artists or "")
            remix_implies_overlap = title_mentions_input_remix(title, track_artists_for_scoring)
            
            # Stricter artist matching requirements - but more lenient for high title similarity
            if not (overlap or remix_implies_overlap):
                if a_sim < 35:  # Keep original threshold
                    ok = False; reject_reason = "guard_artist_sim_no_overlap"
                elif a_sim < 50 and t_sim < 90:  # More lenient: allow lower artist sim if title sim is very high
                    ok = False; reject_reason = "guard_low_artist_high_title_required"
            
            # Dynamic title floor based on artist similarity - more lenient
            title_floor = 75  # Lowered from 80
            if (overlap or remix_implies_overlap) and a_sim >= 50:
                title_floor = 70  # Lowered from 75
            elif a_sim >= 70:
                title_floor = 65  # Lowered from 70
            elif a_sim >= 50:
                title_floor = 72  # Lowered from 78
            
            if t_sim < title_floor:
                ok = False; reject_reason = reject_reason or "guard_title_sim_floor"
            
            # Special case: very high title similarity can override low artist similarity
            if t_sim >= 92 and a_sim >= 25:  # Lowered thresholds
                ok = True; reject_reason = ""

        # Prefer-plain hard guard: if input prefers plain and candidate is a remix, require very strong sims
        if (effective_input_mix and effective_input_mix.get("prefer_plain") and cand_mix.get("is_remix")):
            if not (t_sim >= 98 and a_sim >= 80):
                ok = False
                reject_reason = reject_reason or "unwanted_remix_plain_intent"

        # Explicit Original/Extended intent: More lenient - allow remixes if title/artist match is very high
        if effective_input_mix and (effective_input_mix.get("is_original") or effective_input_mix.get("is_extended")):
            if cand_mix.get("is_remix"):
                # Allow remixes if title similarity is very high (>=95) and artist similarity is good (>=80)
                if not (t_sim >= 95 and a_sim >= 80):
                    ok = False
                    reject_reason = reject_reason or "unwanted_remix_origext_intent"
            if (cand_mix.get("is_edit") or cand_mix.get("is_radio") or cand_mix.get("is_club") or cand_mix.get("is_vip") or cand_mix.get("is_dub")):
                # Allow alt mixes if title similarity is very high (>=98) and artist similarity is excellent (>=90)
                if not (t_sim >= 98 and a_sim >= 90):
                    ok = False
                    reject_reason = reject_reason or "unwanted_altmix_origext_intent"

        # Additional plain-intent safeguard: reject edits/radio/club/dub/vip unless virtually exact
        if effective_input_mix and effective_input_mix.get("prefer_plain"):
            if (cand_mix.get("is_edit") or cand_mix.get("is_radio") or cand_mix.get("is_club") or cand_mix.get("is_dub") or cand_mix.get("is_vip")):
                if not (t_sim >= 99 and a_sim >= 88):
                    ok = False
                    reject_reason = reject_reason or "unwanted_altmix_plain_intent"
            # Also guard against stems (acapella/instrumental)
            if cand_mix.get("is_acapella") or cand_mix.get("is_instrumental"):
                if not (t_sim >= 99 and a_sim >= 90):
                    ok = False
                    reject_reason = reject_reason or "unwanted_stem_plain_intent"

        # Strict remix guards - STRICT: when remix is explicitly requested, require remix
        if input_mix and input_mix.get("is_remix"):
            if not cand_mix.get("is_remix"):
                ok = False
                reject_reason = reject_reason or "wanted_remix"
            else:
                itoks = input_mix.get("remixer_tokens", set())
                ctoks = cand_mix.get("remixer_tokens", set())
                cand_artist_tokens = set(re.split(r'\s+', normalize_text(artists or "")))
                if itoks and not ((itoks & ctoks) or (itoks & cand_artist_tokens)):
                    # STRICT: require remixer token match when specific remixer is requested
                    ok = False
                    reject_reason = reject_reason or "remixer_mismatch_guard"
                
                # When a specific remixer is requested, avoid edits/radio/club/vip even more aggressively
                if itoks and (cand_mix.get("is_edit") or cand_mix.get("is_radio") or cand_mix.get("is_club") or cand_mix.get("is_vip")):
                    if not (t_sim >= 99 and a_sim >= 88):
                        ok = False
                        reject_reason = reject_reason or "unwanted_edit_under_specific_remix"
        # Require at least one original-artist token on candidate artists when remix intent is present
        if ok and input_mix and input_mix.get("is_remix"):
            original_artist_tokens = set()
            for tok in _artist_tokens(track_artists_for_scoring or ""):
                for w in re.split(r"\s+", normalize_text(tok)):
                    if len(w) >= 2:
                        original_artist_tokens.add(w)
            cand_artist_tokens = set(re.split(r"\s+", normalize_text(artists or "")))
            if original_artist_tokens and not (original_artist_tokens & cand_artist_tokens) and t_sim < 97:
                ok = False
                reject_reason = reject_reason or "guard_missing_original_artist_in_remix"

        cand = BeatportCandidate(
            url=u, title=title or "", artists=artists or "", key=key, release_year=year,
            bpm=bpm, label=label, genres=genres, release_name=rel_name, release_date=rel_date,
            score=final, title_sim=t_sim, artist_sim=a_sim, query_index=qidx, query_text=qtext,
            candidate_index=cidx, base_score=comp, bonus_year=yb, bonus_key=kb,
            guard_ok=ok, reject_reason=reject_reason, elapsed_ms=elapsed_ms, is_winner=False
        )
        candidates_log.append(cand)

        if ok and (best is None or final > best.score):
            best = cand
            best_is_family_shape = _is_full_title_plus_one_artist_query(qtext)

        # Track if we've seen a candidate that matches the special phrase
        if input_generic_phrases and matched_generic:
            seen_generic_match = True

        if SETTINGS["TRACE"]:
            tlog(idx, f"[scored] {u}")
            tlog(idx, f"   title='{title}' artists='{artists}'")
            tlog(idx, f"   sims: title={t_sim} artist={a_sim} base={comp:.1f} +y{yb}+k{kb}{'+'+str(bias) if bias else ''} +mix{mix_bonus:+} +gen{gen_bonus:+} +spec{special_bonus:+} => {final:.1f}  q={qidx} cand={cidx} ok={ok} reason={reject_reason or '-'}")

    for i, q in enumerate(queries, 1):
        last_q_processed = i  # record progress before any early breaks
        # Hard caps
        cap = SETTINGS.get("MAX_QUERIES_PER_TRACK")
        if cap and i > int(cap):
            vlog(idx, f"[cap] stopping at {cap} queries")
            break

        budget = SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC")
        elapsed = time.perf_counter() - start
        if (not SETTINGS.get("RUN_ALL_QUERIES") and budget and elapsed > budget):
            vlog(idx, "[timeout] per-track budget exceeded")
            break
        elif (SETTINGS.get("RUN_ALL_QUERIES") and budget and elapsed > budget):
            vlog(idx, "[over-budget] continuing due to RUN_ALL_QUERIES")

        # When explicit remix/special intent, allow earlier exit and cap total queries
        remix_like_intent = bool((input_mix and input_mix.get("is_remix")) or (input_generic_phrases))
        if remix_like_intent:
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES_REMIX", 6)
        elif input_mix and input_mix.get("is_original"):
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES_ORIGINAL", 8)
        else:
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES", 12)
        remix_cap = SETTINGS.get("REMIX_MAX_QUERIES", None)

        t_q0 = time.perf_counter()
        mr = _pick_max_results_for_query(q)
        urls_all = ddg_track_urls(idx, q, max_results=mr)
        q_elapsed = int((time.perf_counter() - t_q0) * 1000)

        # Apply per-query candidate cap (after dedup/fallback) if configured
        cap = SETTINGS.get("PER_QUERY_CANDIDATE_CAP")
        cap_i = int(cap) if (isinstance(cap, (int, str)) and str(cap).isdigit()) else (cap if isinstance(cap, int) else None)
        urls = urls_all[:cap_i] if (cap_i and cap_i > 0 and len(urls_all) > cap_i) else urls_all

        # Log the raw DDG count (faithful), not the capped count
        queries_audit.append((i, q, len(urls_all), q_elapsed))

        print(f"[{idx}]   q{i} -> {len(urls)} candidates (raw={len(urls_all)}, MR={mr}, cap={cap_i or '-'})", flush=True)

        cand_index_map = {u: j for j, u in enumerate(urls, start=1)}

        # Schedule fetches only for URLs we haven't seen before in this track
        to_fetch = [u for u in urls if u not in visited_urls]
        # Mark all as visited (prevents re-scheduling on later queries)
        for u in urls:
            visited_urls.add(u)
        if not to_fetch and SETTINGS["TRACE"]:
            tlog(idx, f"[q{i}] all {len(urls)} candidates already visited; skipping fetch")

        def fetch(u):
            # Serve from per-track cache if available
            if u in parsed_cache:
                title, artists, key, year, bpm, label, genres, rel_name, rel_date = parsed_cache[u]
                return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, 0
            t0 = time.perf_counter()
            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parse_track_page(u)
            parsed_cache[u] = (title, artists, key, year, bpm, label, genres, rel_name, rel_date)
            return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, int((time.perf_counter() - t0)*1000)

        with ThreadPoolExecutor(max_workers=SETTINGS["CANDIDATE_WORKERS"]) as ex:
            futures = [ex.submit(fetch, u) for u in to_fetch]

            if SETTINGS.get("RUN_ALL_QUERIES"):
                for fut in as_completed(futures) if futures else []:
                    try:
                        u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, ems = fut.result()
                    except Exception:
                        continue
                    if not title:
                        consider(u, "", "", None, None, None, None, None, None, None, i, q, cand_index_map.get(u, 0), ems)
                        candidates_log[-1].reject_reason = "no_title"
                        candidates_log[-1].guard_ok = False
                        continue
                    consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), ems)
            else:
                join_timeout = max(6, 3 * len(to_fetch))
                try:
                    for fut in as_completed(futures, timeout=join_timeout) if futures else []:
                        try:
                            u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, ems = fut.result()
                        except Exception:
                            continue
                        if not title:
                            consider(u, "", "", None, None, None, None, None, None, None, i, q, cand_index_map.get(u, 0), ems)
                            candidates_log[-1].reject_reason = "no_title"
                            candidates_log[-1].guard_ok = False
                            continue
                        consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), ems)
                except FuturesTimeoutError:
                    vlog(idx, "[warn] candidate fetch join timed out; capturing finished futures and continuing")
                    for fut in futures:
                        if fut.done():
                            try:
                                u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, ems = fut.result()
                            except Exception:
                                continue
                            if not title:
                                consider(u, "", "", None, None, None, None, None, None, None, i, q, cand_index_map.get(u, 0), ems)
                                candidates_log[-1].reject_reason = "no_title"
                                candidates_log[-1].guard_ok = False
                                continue
                            consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), ems)

        # ----- Remix-specific early exit (lower threshold) -----
        if (not SETTINGS.get("RUN_ALL_QUERIES")) and remix_like_intent and best and best.guard_ok:
            remix_exit_score = int(SETTINGS.get("EARLY_EXIT_SCORE_REMIX", SETTINGS.get("EARLY_EXIT_SCORE", 95)))
            cand_mix_best = _parse_mix_flags(best.title)
            # Must satisfy the stated remix intent (including remixer tokens, if present)
            cand_mix_best = _parse_mix_flags(best.title)
            if _mix_ok_for_early_exit(effective_input_mix, cand_mix_best, best.artists):
                if i >= int(min_q_for_exit or 0) and best.score >= remix_exit_score:
                    print(f"[{idx}]   early-exit (remix) on q{i}: best score {best.score:.1f}", flush=True)
                    break
        # ----- Early exit (family consensus) -----
        if (not SETTINGS.get("RUN_ALL_QUERIES")) and SETTINGS.get("EARLY_EXIT_FAMILY_SCORE") is not None and best and best.guard_ok:
            # Determine thresholds and gating
            family_score = float(SETTINGS.get("EARLY_EXIT_FAMILY_SCORE", 93))
            family_after = int(SETTINGS.get("EARLY_EXIT_FAMILY_AFTER", 8))
            if input_mix and input_mix.get("is_original"):
                family_after = min(family_after, int(SETTINGS.get("EARLY_EXIT_FAMILY_AFTER_ORIGINAL", 6)))
            # Respect remix/special min-queries as well (e.g., EARLY_EXIT_MIN_QUERIES_REMIX)
            # Never allow family-exit before the configured minimum for this intent
            family_after = max(family_after, int(min_q_for_exit or family_after))
            generic_ok = True
            if input_generic_phrases:
                generic_ok = _any_phrase_token_set_in_title(input_generic_phrases, best.title or "")
            mix_ok = (not SETTINGS.get("EARLY_EXIT_REQUIRE_MIX_OK", True)) or _mix_ok_for_early_exit(effective_input_mix, _parse_mix_flags(best.title), best.artists)
            # Allow family exit if our current best came from ANY full-title+one-artist query
            if best_is_family_shape and generic_ok and mix_ok and best.score >= family_score and i >= family_after:
                print(f"[{idx}]   early-exit (family consensus) on q{i}: best score {best.score:.1f}", flush=True)
                break

            # Also allow immediate family exit when the *current* query itself is family-shaped
            if _is_full_title_plus_one_artist_query(q) and generic_ok and mix_ok and best.score >= family_score and i >= family_after:
                print(f"[{idx}]   early-exit (family consensus) on q{i}: best score {best.score:.1f}", flush=True)
                break

        # ----- Early exit check after each query -----
        if (not SETTINGS.get("RUN_ALL_QUERIES")) and best and best.guard_ok:
            generic_ok = True
            if input_generic_phrases:
                generic_ok = _any_phrase_token_set_in_title(input_generic_phrases, best.title or "")
            if SETTINGS.get("EARLY_EXIT_SCORE") and best.score >= SETTINGS["EARLY_EXIT_SCORE"]:
                if i >= int(min_q_for_exit or 0):
                    mix_ok = (not SETTINGS.get("EARLY_EXIT_REQUIRE_MIX_OK", True)) or _mix_ok_for_early_exit(effective_input_mix, _parse_mix_flags(best.title), best.artists)
                    if mix_ok and generic_ok:
                        print(f"[{idx}]   early-exit on q{i}: best score {best.score:.1f}", flush=True)
                        break
        if remix_like_intent and remix_cap and i >= int(remix_cap):
            vlog(idx, f"[remix-cap] stopping at {remix_cap} queries (remix/special intent)")
            break

    if best:
        for c in candidates_log:
            if c.url == best.url:
                c.is_winner = True
                break

    return best, candidates_log, queries_audit, last_q_processed

def process_track(idx: int, rb: RBTrack) -> Tuple[Dict[str, str], List[Dict[str, str]], List[Dict[str, str]]]:
    t0 = time.perf_counter()

    original_artists = rb.artists or ""
    title_for_search = rb.title
    artists_for_scoring = original_artists

    title_only_search = False
    extracted = False

    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, title_for_search = ex
            extracted = True
        title_only_search = True

    clean_title_for_log = sanitize_title_for_search(title_for_search)
    # Handle Unicode encoding for Windows
    try:
        print(f"[{idx}] Searching Beatport for: {clean_title_for_log} - {original_artists or artists_for_scoring}", flush=True)
    except UnicodeEncodeError:
        # Fallback to ASCII-safe version
        safe_title = clean_title_for_log.encode('ascii', 'ignore').decode('ascii')
        safe_artists = (original_artists or artists_for_scoring).encode('ascii', 'ignore').decode('ascii')
        print(f"[{idx}] Searching Beatport for: {safe_title} - {safe_artists}", flush=True)
    if extracted and title_only_search:
        print(f"[{idx}]   (artists inferred from title for scoring; search is title-only)", flush=True)

    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )

    print(f"[{idx}]   queries:", flush=True)
    for i, q in enumerate(queries, 1):
        try:
            print(f"[{idx}]     {i}. site:beatport.com/track {q}", flush=True)
        except UnicodeEncodeError:
            # Fallback to ASCII-safe version
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}]     {i}. site:beatport.com/track {safe_q}", flush=True)

    # NEW: parse intent + special phrases from original title and pass to matcher
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)

    best, candlog, queries_audit, stop_qidx = best_beatport_match(
        idx,
        title_for_search,
        artists_for_scoring,
        (title_only_search and not extracted),
        queries,
        input_year=None,
        input_key=None,
        input_mix=input_mix_flags,
        input_generic_phrases=input_generic_phrases,
    )

    dur = (time.perf_counter() - t0) * 1000
    cand_rows: List[Dict[str, str]] = []
    for c in candlog:
        m = re.search(r'/track/[^/]+/(\d+)', c.url)
        bp_id = m.group(1) if m else ""
        cand_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "candidate_url": c.url,
            "candidate_track_id": bp_id,
            "candidate_title": c.title,
            "candidate_artists": c.artists,
            "candidate_key": c.key or "",
            "candidate_key": c.key or "",
            "candidate_key_camelot": _camelot_key(c.key),
            "candidate_year": c.release_year or "",
            "candidate_bpm": c.bpm or "",
            "candidate_label": c.label or "",
            "candidate_genres": c.genres or "",
            "candidate_release": c.release_name or "",
            "candidate_release_date": c.release_date or "",
            "title_sim": str(c.title_sim),
            "artist_sim": str(c.artist_sim),
            "base_score": f"{c.base_score:.1f}",
            "bonus_year": str(c.bonus_year),
            "bonus_key": str(c.bonus_key),
            "final_score": f"{c.score:.1f}",
            "guard_ok": "Y" if c.guard_ok else "N",
            "reject_reason": c.reject_reason or "",
            "search_query_index": str(c.query_index),
            "search_query_text": c.query_text,
            "candidate_index": str(c.candidate_index),
            "elapsed_ms": str(c.elapsed_ms),
            "winner": "Y" if c.is_winner else "N",
        })

    # Queries audit rows
    queries_rows: List[Dict[str, str]] = []
    for (qidx, qtext, num_cands, q_ms) in queries_audit:
        is_winner = "Y" if (best and qidx == best.query_index) else "N"
        winner_cand_idx = str(best.candidate_index) if (best and qidx == best.query_index) else ""
        is_stop = "Y" if qidx == stop_qidx else "N"
        queries_rows.append({
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "search_query_index": str(qidx),
            "search_query_text": qtext,
            "candidate_count": str(num_cands),
            "elapsed_ms": str(q_ms),
            "is_winner": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "is_stop": is_stop,
        })

    if best and best.score >= SETTINGS["MIN_ACCEPT_SCORE"]:
        # Handle Unicode encoding for Windows
        try:
            print(f"[{idx}] -> Match: {best.title} - {best.artists} "
                  f"(key {best.key or '?'}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
            # Fallback to ASCII-safe version
            safe_title = best.title.encode('ascii', 'ignore').decode('ascii')
            safe_artists = best.artists.encode('ascii', 'ignore').decode('ascii')
            safe_key = (best.key or '?').encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}] -> Match: {safe_title} - {safe_artists} "
                  f"(key {safe_key}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)

        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        main_row = {
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "beatport_title": best.title,
            "beatport_artists": best.artists,
            "beatport_key": best.key or "",
            "beatport_key_camelot": _camelot_key(best.key) or "",
            "beatport_year": best.release_year or "",
            "beatport_bpm": best.bpm or "",
            "beatport_label": best.label or "",
            "beatport_genres": best.genres or "",
            "beatport_release": best.release_name or "",
            "beatport_release_date": best.release_date or "",
            "beatport_track_id": beatport_track_id,
            "beatport_url": best.url,
            "title_sim": str(best.title_sim),
            "artist_sim": str(best.artist_sim),
            "match_score": f"{best.score:.1f}",
            "confidence": _confidence_label(best.score),
            "search_query_index": str(best.query_index),
            "search_stop_query_index": str(stop_qidx),
            "candidate_index": str(best.candidate_index),
        }
        return main_row, cand_rows, queries_rows
    else:
        try:
            print(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
            # Fallback to ASCII-safe version
            print(f"[{idx}] -> No match candidates found. [{dur:.0f} ms]", flush=True)
        main_row = {
            "playlist_index": str(idx),
            "original_title": rb.title,
            "original_artists": rb.artists,
            "beatport_title": "",
            "beatport_artists": "",
            "beatport_key": "",
            "beatport_key_camelot": "",
            "beatport_year": "",
            "beatport_bpm": "",
            "beatport_label": "",
            "beatport_genres": "",
            "beatport_release": "",
            "beatport_release_date": "",
            "beatport_track_id": "",
            "beatport_url": "",
            "title_sim": "0",
            "artist_sim": "0",
            "match_score": "0.0",
            "confidence": "low",
            "search_query_index": "0",
            "search_stop_query_index": "0",
            "candidate_index": "0",
        }
        return main_row, cand_rows, queries_rows

def run(xml_path: str, playlist_name: str, out_csv_base: str):
    random.seed(SETTINGS["SEED"])

    if SETTINGS["ENABLE_CACHE"] and HAVE_CACHE:
        import requests_cache  # type: ignore
        requests_cache.install_cache("bp_cache", expire_after=60 * 60 * 24)

    tracks_by_id, playlists = parse_rekordbox(xml_path)
    if playlist_name not in playlists:
        raise SystemExit(
            f'Playlist "{playlist_name}" not found. Available: {", ".join(sorted(playlists.keys()))}'
        )

    tids = playlists[playlist_name]
    rows: List[Dict[str, str]] = []
    all_candidates: List[Dict[str, str]] = []
    all_queries: List[Dict[str, str]] = []

    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))

    if SETTINGS["TRACK_WORKERS"] > 1:
        with ThreadPoolExecutor(max_workers=SETTINGS["TRACK_WORKERS"]) as ex:
            for main_row, cand_rows, query_rows in ex.map(lambda args: process_track(*args), inputs):
                rows.append(main_row)
                all_candidates.extend(cand_rows)
                all_queries.extend(query_rows)
    else:
        for args in inputs:
            main_row, cand_rows, query_rows = process_track(*args)
            rows.append(main_row)
            all_candidates.extend(cand_rows)
            all_queries.extend(query_rows)

    out_main = with_timestamp(out_csv_base)
    out_review = re.sub(r"\.csv$", "_review.csv", out_main) if out_main.lower().endswith(".csv") else out_main + "_review.csv"
    out_cands = re.sub(r"\.csv$", "_candidates.csv", out_main) if out_main.lower().endswith(".csv") else out_main + "_candidates.csv"
    out_queries = re.sub(r"\.csv$", "_queries.csv", out_main) if out_main.lower().endswith(".csv") else out_main + "_queries.csv"

    main_fields = [
        "playlist_index",
        "original_title",
        "original_artists",
        "beatport_title",
        "beatport_artists",
        "beatport_key",
        "beatport_key_camelot",
        "beatport_year",
        "beatport_bpm",
        "beatport_label",
        "beatport_genres",
        "beatport_release",
        "beatport_release_date",
        "beatport_track_id",
        "beatport_url",
        "title_sim",
        "artist_sim",
        "match_score",
        "confidence",
        "search_query_index",
        "search_stop_query_index",
        "candidate_index",
    ]
    with open(out_main, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=main_fields)
        writer.writeheader()
        writer.writerows(rows)

    review_rows: List[Dict[str, str]] = []
    review_indices = set()  # Track which playlist indices need review
    for r in rows:
        score = float(r.get("match_score", "0") or 0)
        artist_sim = int(r.get("artist_sim", "0") or 0)
        artists_present = bool((r.get("original_artists") or "").strip())
        reason = []
        if score < 85:
            reason.append("score<85")
        if artists_present and artist_sim < 35:
            if not _artist_token_overlap(r.get("original_artists",""), r.get("beatport_artists","")):
                reason.append("weak-artist-match")
        if (r.get("beatport_url") or "").strip() == "":
            reason.append("no-candidates")
        if reason:
            rr = dict(r); rr["review_reason"] = ",".join(reason)
            review_rows.append(rr)
            review_indices.add(int(r.get("playlist_index", "0")))

    if review_rows:
        with open(out_review, "w", newline="", encoding="utf-8") as f2:
            writer2 = csv.DictWriter(f2, fieldnames=main_fields + ["review_reason"])
            writer2.writeheader()
            writer2.writerows(review_rows)
        print(f"Review list: {len(review_rows)} rows -> {out_review}")

    cand_fields = [
        "playlist_index","original_title","original_artists",
        "candidate_url","candidate_track_id","candidate_title","candidate_artists",
        "candidate_key","candidate_key_camelot","candidate_year","candidate_bpm","candidate_label","candidate_genres",
        "candidate_release","candidate_release_date",
        "title_sim","artist_sim","base_score","bonus_year","bonus_key","final_score",
        "guard_ok","reject_reason","search_query_index","search_query_text","candidate_index","elapsed_ms","winner",
    ]

    # Create review-specific candidates CSV
    review_candidates = [c for c in all_candidates if int(c.get("playlist_index", "0")) in review_indices]
    if review_candidates:
        out_review_cands = re.sub(r"\.csv$", "_review_candidates.csv", out_main) if out_main.lower().endswith(".csv") else out_main + "_review_candidates.csv"
        with open(out_review_cands, "w", newline="", encoding="utf-8") as fc:
            wc = csv.DictWriter(fc, fieldnames=cand_fields)
            wc.writeheader()
            wc.writerows(review_candidates)
        print(f"Review candidates: {len(review_candidates)} rows -> {out_review_cands}")

    queries_fields = [
        "playlist_index","original_title","original_artists",
        "search_query_index","search_query_text","candidate_count","elapsed_ms",
        "is_winner","winner_candidate_index","is_stop"
    ]

    # Create review-specific queries CSV
    review_queries = [q for q in all_queries if int(q.get("playlist_index", "0")) in review_indices]
    if review_queries:
        out_review_queries = re.sub(r"\.csv$", "_review_queries.csv", out_main) if out_main.lower().endswith(".csv") else out_main + "_review_queries.csv"
        with open(out_review_queries, "w", newline="", encoding="utf-8") as fq:
            wq = csv.DictWriter(fq, fieldnames=queries_fields)
            wq.writeheader()
            wq.writerows(review_queries)
        print(f"Review queries: {len(review_queries)} rows -> {out_review_queries}")
    if all_candidates:
        with open(out_cands, "w", newline="", encoding="utf-8") as fc:
            wc = csv.DictWriter(fc, fieldnames=cand_fields)
            wc.writeheader()
            wc.writerows(all_candidates)
        print(f"Candidates: {len(all_candidates)} rows -> {out_cands}")

    if all_queries:
        queries_fields = [
        "playlist_index","original_title","original_artists",
        "search_query_index","search_query_text","candidate_count","elapsed_ms",
        "is_winner","winner_candidate_index","is_stop"
    ]
        with open(out_queries, "w", newline="", encoding="utf-8") as fq:
            wq = csv.DictWriter(fq, fieldnames=queries_fields)
            wq.writeheader()
            wq.writerows(all_queries)
        print(f"Queries: {len(all_queries)} rows -> {out_queries}")

    print(f"\nDone. Wrote {len(rows)} rows -> {out_main}")

# -----------------------------
# CLI
# -----------------------------
def main():
    ap = argparse.ArgumentParser(description="Enrich Rekordbox playlist with Beatport metadata (Accuracy + Logs + Candidates)")
    ap.add_argument("--xml", required=True, help="Path to Rekordbox XML export")
    ap.add_argument("--playlist", required=True, help="Playlist name in the XML")
    ap.add_argument("--out", default="beatport_enriched.csv", help="Output CSV base name (timestamp auto-appended)")

    ap.add_argument("--fast", action="store_true", help="Faster defaults (safe)")
    ap.add_argument("--turbo", action="store_true", help="Maximum speed (be gentle)")
    ap.add_argument("--exhaustive", action="store_true",
                    help="Explode query variants (grams×artists), raise DDG per-query cap, extend time budget")

    ap.add_argument("--verbose", action="store_true", help="Verbose logs")
    ap.add_argument("--trace", action="store_true", help="Very detailed per-candidate logs")

    ap.add_argument("--seed", type=int, default=0, help="Random seed for determinism (default 0)")

    ap.add_argument("--all-queries", action="store_true",
                help="Run EVERY query variation: disable time budget, wait for all candidates, allow tri-gram crosses")
    ap.add_argument("--myargs", action="store_true",
                    help="Apply your custom settings bundle (edit the dict in code below)")

    args = ap.parse_args()

    if args.fast:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 8,
            "TRACK_WORKERS": 4,
            "PER_TRACK_TIME_BUDGET_SEC": 15,
            "ENABLE_CACHE": True,
        })
    if args.turbo:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 12,
            "CANDIDATE_WORKERS": 12,
            "TRACK_WORKERS": 8,
            "PER_TRACK_TIME_BUDGET_SEC": 10,
            "ENABLE_CACHE": True,
        })
    if args.exhaustive:
        SETTINGS.update({
            "MAX_SEARCH_RESULTS": 100,
            "CANDIDATE_WORKERS": 16,
            "TRACK_WORKERS": max(SETTINGS["TRACK_WORKERS"], 8),
            "PER_TRACK_TIME_BUDGET_SEC": max(SETTINGS["PER_TRACK_TIME_BUDGET_SEC"], 100),
            "ENABLE_CACHE": True,
            "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,
            "CROSS_SMALL_ONLY": True,
            "REVERSE_ORDER_QUERIES": False,
        })
    if args.all_queries:
        SETTINGS.update({
            "RUN_ALL_QUERIES": True,
            "PER_TRACK_TIME_BUDGET_SEC": None,
            "CROSS_SMALL_ONLY": False,
            "TITLE_GRAM_MAX": max(SETTINGS["TITLE_GRAM_MAX"], 3),
            "MAX_SEARCH_RESULTS": max(SETTINGS["MAX_SEARCH_RESULTS"], 20),
            "CANDIDATE_WORKERS": max(SETTINGS["CANDIDATE_WORKERS"], 16),
            "TRACK_WORKERS": max(SETTINGS["TRACK_WORKERS"], 10),
            "ENABLE_CACHE": True,
        })

    # Custom bundle preset (edit values here to taste)
    if args.myargs:
        SETTINGS.update({
            # ---- Core speed/concurrency ----
            "ENABLE_CACHE": True,                 # use requests-cache
            "CANDIDATE_WORKERS": 10,              # good for M1 Air + fast net
            "TRACK_WORKERS": 10,                   # stay polite with DDG/Beatport
            "PER_TRACK_TIME_BUDGET_SEC": None,      # set None to disable budget

            # ---- Similarity weights ----
            "TITLE_WEIGHT": 0.55,
            "ARTIST_WEIGHT": 0.45,

            # ---- Early exit tuning ----
            "EARLY_EXIT_SCORE": 98,               # exit when >=95 and mix/phrase ok
            "EARLY_EXIT_MIN_QUERIES": 2,         # minimum queries before early exit
            "EARLY_EXIT_REQUIRE_MIX_OK": True,    # candidate must satisfy mix intent
            "EARLY_EXIT_FAMILY_SCORE": 5,        # consensus threshold for family
            "EARLY_EXIT_FAMILY_AFTER": 5,         # don't allow family exit before 5 queries
            "EARLY_EXIT_MIN_QUERIES_REMIX": 5,    # quicker for explicit remix/special
            "REMIX_MAX_QUERIES": 24,              # cap when remix/special intent

            # ---- Adaptive max_results per query shape ----
            "ADAPTIVE_MAX_RESULTS": True,
            "MR_LOW": 10,                         # grams/combos
            "MR_MED": 20,                         # full-title + artist
            "MR_HIGH": 40,                       # phrases/remix/rare patterns

            # ---- Query-generation shape preferences ----
            "FULL_TITLE_WITH_ARTIST_ONLY": True,  # prefer "<full title> + artist" shapes
            "LINEAR_PREFIX_ONLY": True,           # grams as left-anchored prefixes only
            "REVERSE_ORDER_QUERIES": False,       # keep title first
            "PRIORITY_REVERSE_STAGE": True,       # but allow reverse for remixer hints
            "REVERSE_REMIX_HINTS": True,
            "QUOTED_TITLE_VARIANT": False,        # trim quoted duplicates

            # ---- N-gram / combos controls (kept but mostly off) ----
            "TITLE_GRAM_MAX": 3,
            "CROSS_TITLE_GRAMS_WITH_ARTISTS": True,
            "CROSS_SMALL_ONLY": True,
            "RUN_EXHAUSTIVE_COMBOS": False,
            "TITLE_COMBO_MIN_LEN": 2,
            "TITLE_COMBO_MAX_LEN": 6,
            "INCLUDE_PERMUTATIONS": False,
            "PERMUTATION_K_CAP": 5,
            "MAX_COMBO_QUERIES": None,

            # ---- Safeguards / misc ----
            "MAX_SEARCH_RESULTS": 20,             # global default (adaptive overrides)
            "PER_QUERY_CANDIDATE_CAP": 25,
            "MAX_QUERIES_PER_TRACK": 50,         # overall safety cap
            "MIN_ACCEPT_SCORE": 0,
            "CONNECT_TIMEOUT": 5,
            "READ_TIMEOUT": 10,
        })

    SETTINGS["VERBOSE"] = bool(args.verbose)
    SETTINGS["TRACE"] = bool(args.trace)
    SETTINGS["SEED"] = int(args.seed)

    startup_banner(sys.argv[0], args)
    run(args.xml, args.playlist, args.out)

if __name__ == "__main__":
    main()