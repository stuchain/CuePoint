#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Matching and scoring logic for Beatport candidates

This module contains the core matching algorithm that:
1. Executes search queries to find candidate tracks
2. Fetches and parses candidate track data from Beatport
3. Scores each candidate using fuzzy string matching
4. Applies guards to reject false positives
5. Implements early exit for performance optimization

Key components:
- best_beatport_match(): Main matching function that orchestrates the entire process
- consider(): Scores and evaluates individual candidates
- Guards: Prevent subset matches, weak matches, wrong mix types
- Bonuses: Key matches, year matches, mix type matches, special phrases
- Early exit: Stops searching when excellent match is found
"""

import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from rapidfuzz import fuzz

from beatport import BeatportCandidate, track_urls, is_track_url, parse_track_page
from config import NEAR_KEYS, SETTINGS
from mix_parser import (
    _any_phrase_token_set_in_title,
    _infer_special_mix_intent,
    _mix_bonus,
    _mix_ok_for_early_exit,
    _parse_mix_flags,
)
from query_generator import _artist_tokens, _ordered_unique
from text_processing import (
    _artist_token_overlap,
    _word_tokens,
    normalize_text,
    sanitize_title_for_search,
    score_components,
)
from utils import tlog, vlog


def _norm_key(k: Optional[str]) -> Optional[str]:
    """
    Normalize musical key string to consistent format
    
    Converts variations like "E Major", "e maj", "E-Major" to "emajor"
    Used for key matching comparisons.
    
    Args:
        k: Key string (e.g., "E Major", "A# Minor")
    
    Returns:
        Normalized key string or None if invalid
    """
    if not k:
        return None
    k = k.strip().lower()
    k = k.replace("maj", "major").replace("min", "minor").replace(" ", "")
    return k


def _significant_tokens(s: str) -> List[str]:
    """
    Extract meaningful tokens from text, filtering out stopwords
    
    Used for subset match prevention. Only counts tokens that are:
    - At least 3 characters long
    - Not common stopwords (the, a, and, of, etc.)
    - Not mix-related terms (mix, remix, extended, etc.)
    
    Example:
        "Son of Sun" → ["son", "sun"]  (not ["son", "of", "sun"])
        "The Night" → ["night"]        (filters "the")
    
    Args:
        s: Input text string
    
    Returns:
        List of significant normalized tokens
    """
    # Stopwords to filter out (common words that don't add meaning)
    STOP = {"the", "a", "an", "and", "of", "to", "for", "in", "on", "with", "vs", "x",
            "feat", "ft", "featuring", "mix", "edit", "remix", "version", "club", "radio",
            "original", "extended", "vip", "dub", "rework", "refire", "re-fire"}
    toks = [t for t in re.split(r"\s+", normalize_text(s)) if t]
    return [t for t in toks if len(t) >= 3 and t not in STOP]


def _year_bonus(input_year: Optional[int], cand_year: Optional[int]) -> int:
    """
    Calculate bonus score for year matching
    
    Bonuses:
    - +2: Exact year match
    - +1: Year within 1 year (e.g., 2023 vs 2024)
    - +0: No match or missing data
    
    Args:
        input_year: Year from Rekordbox (currently not used, always None)
        cand_year: Year from Beatport candidate
    
    Returns:
        Bonus points (0, 1, or 2)
    """
    if not input_year or not cand_year:
        return 0
    if cand_year == input_year:
        return 2
    if abs(cand_year - input_year) == 1:
        return 1
    return 0


def _key_bonus(input_key: Optional[str], cand_key: Optional[str]) -> int:
    """
    Calculate bonus score for musical key matching
    
    Bonuses:
    - +2: Exact key match (e.g., "E Major" = "E Major")
    - +1: Near-equivalent key match (e.g., "C#" = "Db", "F#" = "Gb")
    - +0: No match or missing data
    
    Uses NEAR_KEYS mapping for equivalent keys (C# = Db, etc.)
    
    Args:
        input_key: Key from Rekordbox (currently not used, always None)
        cand_key: Key from Beatport candidate
    
    Returns:
        Bonus points (0, 1, or 2)
    """
    a, b = _norm_key(input_key), _norm_key(cand_key)
    if not a or not b:
        return 0
    if a == b:
        return 2
    if a in NEAR_KEYS and b in NEAR_KEYS[a]:
        return 1
    return 0


def _camelot_key(key: Optional[str]) -> str:
    """
    Convert musical key to Camelot wheel notation
    
    Camelot wheel is a DJ mixing system where keys are numbered 1-12 with A/B designation.
    This makes it easier to find compatible keys for mixing.
    
    Examples:
        "E Major" → "12B"
        "E Minor" → "9A"
        "C Major" → "8B"
        "A Minor" → "8A"
    
    Args:
        key: Musical key string (e.g., "E Major", "A# Minor")
    
    Returns:
        Camelot notation (e.g., "12B", "9A") or empty string if invalid
    """
    if not key:
        return ""
    s = (key or "").strip()
    if not s:
        return ""
    # Normalize Unicode characters (flat/sharp symbols)
    s = s.replace("♭", "b").replace("♯", "#")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("–", "-").replace("—", "-").strip()
    s = re.sub(r"(?i)\bmaj(?:or)?\b", "Major", s)
    s = re.sub(r"(?i)\bmin(?:or)?\b", "Minor", s)

    # Parse key format: "E Major", "A# Minor", etc.
    m = re.match(r"^\s*([A-G])\s*(#|b)?\s*(major|minor)\s*$", s, flags=re.I)
    if m:
        letter = m.group(1).upper()
        acc = m.group(2) or ""
        qual = "Major" if m.group(3).lower() == "major" else "Minor"
        note = letter + acc
    else:
        note, qual = None, None

    # Camelot wheel mapping: (Note, Quality) -> Camelot Notation
    cam = {
        ("A", "Major"): "11B", ("Ab", "Major"): "4B", ("G#", "Major"): "4B",
        ("B", "Major"): "1B", ("Bb", "Major"): "6B", ("A#", "Major"): "6B",
        ("C", "Major"): "8B", ("C#", "Major"): "3B", ("Db", "Major"): "3B",
        ("D", "Major"): "10B", ("Eb", "Major"): "5B", ("D#", "Major"): "5B",
        ("E", "Major"): "12B", ("F", "Major"): "7B", ("F#", "Major"): "2B",
        ("Gb", "Major"): "2B", ("G", "Major"): "9B",
        ("A", "Minor"): "8A", ("Ab", "Minor"): "1A", ("G#", "Minor"): "1A",
        ("B", "Minor"): "10A", ("Bb", "Minor"): "3A", ("A#", "Minor"): "3A",
        ("C", "Minor"): "5A", ("C#", "Minor"): "12A", ("Db", "Minor"): "12A",
        ("D", "Minor"): "7A", ("Eb", "Minor"): "2A", ("D#", "Minor"): "2A",
        ("E", "Minor"): "9A", ("F", "Minor"): "4A", ("F#", "Minor"): "11A",
        ("Gb", "Minor"): "11A", ("G", "Minor"): "6A",
    }

    if note and qual:
        return cam.get((note, qual), "")
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
    """Match result row"""
    playlist_index: int
    row: Dict[str, str]


def _confidence_label(score: float) -> str:
    """
    Convert numeric match score to human-readable confidence label
    
    Confidence levels:
    - "high": Score >= 95 (excellent match, very confident)
    - "med": Score >= 85 (good match, moderately confident)
    - "low": Score < 85 (questionable match, low confidence)
    
    Args:
        score: Final match score (0-200+)
    
    Returns:
        Confidence label string
    """
    return "high" if score >= 95 else "med" if score >= 85 else "low"


def best_beatport_match(
    idx: int,
    track_title: str,
    track_artists_for_scoring: str,
    title_only_mode: bool,
    queries: List[str],
    input_year: Optional[int] = None,
    input_key: Optional[str] = None,
    input_mix: Optional[Dict[str, object]] = None,
    input_generic_phrases: Optional[List[str]] = None,
) -> Tuple[Optional[BeatportCandidate], List[BeatportCandidate], List[Tuple[int, str, int, int]], int]:
    """
    Find best Beatport match for a track by executing queries and scoring candidates.
    
    This is the core matching function that:
    1. Executes each query in sequence (with time budget)
    2. Fetches candidate track URLs from search results
    3. Parses candidate track data from Beatport (parallel fetching)
    4. Scores each candidate using fuzzy matching + bonuses
    5. Applies guards to reject false positives
    6. Implements early exit when excellent match found
    
    Args:
        idx: Track index (for logging)
        track_title: Clean track title (already sanitized)
        track_artists_for_scoring: Artist string for scoring
        title_only_mode: True if no artists available (title-only search)
        queries: List of search queries to execute
        input_year: Optional year from Rekordbox (currently unused)
        input_key: Optional key from Rekordbox (currently unused)
        input_mix: Mix type flags (is_remix, is_extended, etc.)
        input_generic_phrases: Special parenthetical phrases (e.g., "Ivory Re-fire")
    
    Returns:
        Tuple of:
        - best_candidate: Best matching candidate (or None if no match)
        - all_candidates: All candidates evaluated (for logging)
        - queries_audit: List of (query_index, query_text, candidate_count, elapsed_ms)
        - last_query_index: Last query index processed
    """
    start = time.perf_counter()  # Start timer for time budget tracking
    best: Optional[BeatportCandidate] = None  # Best match found so far
    candidates_log: List[BeatportCandidate] = []  # All candidates evaluated
    queries_audit: List[Tuple[int, str, int, int]] = []  # Query execution log
    last_q_processed = 0  # Last query index processed

    # Caching to avoid re-parsing the same tracks
    # parsed_cache: URL -> (title, artists, key, year, bpm, label, genres, release_name, release_date)
    parsed_cache: Dict[str, Tuple[str, str, Optional[str], Optional[int], Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]] = {}
    
    # parsed_cache_by_id: Track ID -> same tuple (for deduplication by track ID)
    parsed_cache_by_id: Dict[str, Tuple[str, str, Optional[str], Optional[int], Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]] = {}
    
    visited_urls: set[str] = set()  # URLs we've already fetched
    visited_track_ids: set[str] = set()  # Track IDs we've already parsed (avoid re-parsing)

    # track_title should already be cleaned (no [F], [3], etc.) but ensure it's clean
    base_title_clean = sanitize_title_for_search(track_title).strip().lower()
    artist_word_set = set()
    for tok in _artist_tokens(track_artists_for_scoring or ""):
        for w in re.split(r"\s+", normalize_text(tok)):
            if len(w) >= 2:
                artist_word_set.add(w)

    def _is_full_title_plus_one_artist_query(q: str) -> bool:
        """Check if query is full title + one artist"""
        if not base_title_clean:
            return False
        ql = (q or "").lower().strip()
        phrases = ["original mix", "extended mix"]
        for p in (input_generic_phrases or []):
            pp = normalize_text(p)
            if pp:
                phrases.append(pp)
        prefixes = [base_title_clean]
        prefixes.extend([f"{base_title_clean} ({ph})" for ph in dict.fromkeys(phrases)])

        def _match_with_prefix(prefix: str) -> bool:
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
        """Adaptive max_results based on query shape"""
        if not SETTINGS.get("ADAPTIVE_MAX_RESULTS", True):
            return int(SETTINGS.get("MAX_SEARCH_RESULTS", 50))
        ql = (q or "").lower()
        has_phrase = ("(" in ql and ")" in ql)
        has_mix = any(x in ql for x in [" remix", "extended mix", "original mix", "dub mix", " re-fire", " refire", " rework"])
        family_full_plus_one = _is_full_title_plus_one_artist_query(q)
        scarcity = len(visited_urls) < 6

        if "original mix" in ql:
            return int(SETTINGS.get("MR_MED", 40))
        if has_mix or has_phrase or family_full_plus_one:
            return int(SETTINGS.get("MR_HIGH", 100)) if scarcity else int(SETTINGS.get("MR_MED", 40))
        return int(SETTINGS.get("MR_LOW", 10))

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
            if not tok_n:
                continue
            if re.search(rf'\b{re.escape(tok_n)}\b\s+remix\b', ct, flags=re.I):
                return True
        return False

    def consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, qidx, qtext, cidx, elapsed_ms):
        """
        Evaluate and score a single candidate track
        
        This function:
        1. Calculates title and artist similarity scores
        2. Applies guards to reject false positives
        3. Calculates bonuses (key, year, mix type, special phrases)
        4. Applies penalties (subset matches, mix mismatches)
        5. Updates best match if this candidate is better
        
        Args:
            u: Beatport track URL
            title: Candidate track title
            artists: Candidate track artists
            key: Musical key
            year: Release year
            bpm: BPM
            label: Record label
            genres: Genres
            rel_name: Release name
            rel_date: Release date
            qidx: Query index that found this candidate
            qtext: Query text that found this candidate
            cidx: Candidate index (position in query results)
            elapsed_ms: Time spent parsing this candidate (milliseconds)
        """
        nonlocal best, seen_generic_match, best_is_family_shape
        ok = True  # Whether candidate passes guards (not rejected)
        reject_reason = ""  # Reason for rejection (if rejected)
        
        # Calculate base similarity scores using RapidFuzz
        # t_sim: Title similarity (0-100)
        # a_sim: Artist similarity (0-100)
        # comp: Combined base score (weighted: TITLE_WEIGHT * t_sim + ARTIST_WEIGHT * a_sim)
        t_sim, a_sim, comp = score_components(track_title, track_artists_for_scoring, title, artists or "")

        # ========================================================================
        # GUARD 1: Subset Match Prevention
        # ========================================================================
        # CRITICAL: Prevent "Sun" from matching "Son of Sun" with 100% similarity
        # RapidFuzz's token_set_ratio can give 100% match when one string is a subset
        # We use significant tokens (excluding stopwords) to accurately compare word counts
        
        if title and track_title:
            # Extract meaningful tokens (>=3 chars, not stopwords)
            input_sig = set([t.lower() for t in _significant_tokens(track_title)])
            cand_sig = set([t.lower() for t in _significant_tokens(title)])
            
            # If candidate has significantly fewer tokens, it's likely a subset
            if len(cand_sig) > 0 and len(input_sig) > len(cand_sig):
                token_ratio = len(cand_sig) / len(input_sig)
                
                # Reject if candidate has < 50% of input tokens AND high similarity
                # Example: "Sun" (1 token) matching "Son of Sun" (2 tokens) = 0.5 ratio
                if token_ratio < 0.5 and t_sim >= 85:
                    ok = False
                    reject_reason = "guard_title_subset_match"
                # Penalize if candidate has < 67% of tokens AND very high similarity
                # Reduces score but doesn't reject (may still be valid in some cases)
                elif token_ratio < 0.67 and t_sim >= 90:
                    t_sim = max(70, t_sim - 15)  # Reduce by 15 points (keep at least 70)

        # ========================================================================
        # GUARD 2: Title Token Coverage
        # ========================================================================
        # Reject if candidate shares < 30% of significant tokens with input
        # AND both title and artist similarity are low
        # This prevents matches where titles are completely different
    
        in_sig = _significant_tokens(track_title)
        cand_sig = _significant_tokens(title or "")

        if len(in_sig) >= 2:  # Only apply if input has 2+ significant tokens
            shared = set(in_sig) & set(cand_sig)  # Common tokens
            coverage = len(shared) / max(1, len(in_sig))  # Percentage of input tokens matched
            
            # Reject if low coverage AND both similarities are low
            if coverage < 0.3 and t_sim < 85 and a_sim < 90:
                ok = False
                reject_reason = "guard_title_token_coverage"

        # ========================================================================
        # BONUSES: Additional score adjustments
        # ========================================================================
        
        # Year bonus: +2 for exact match, +1 for ±1 year
        yb = _year_bonus(input_year, year)
        
        # Key bonus: +2 for exact match, +1 for equivalent key (C# = Db)
        kb = _key_bonus(input_key, key)

        # Mix type bonus: Positive for correct mix type, negative for wrong type
        # e.g., +10 for remix→remix, -20 for remix→original
        cand_mix = _parse_mix_flags(title or "")
        mix_bonus, _mix_reason = _mix_bonus(effective_input_mix, cand_mix)

        # Special bonuses for refire/rework matches
        special_bonus = 0
        if special_intent.get("want_refire"):
            if cand_mix.get("is_refire"):
                special_bonus += 12  # Bonus for matching "Re-fire" variant
        if special_intent.get("want_rework"):
            if cand_mix.get("is_rework"):
                special_bonus += 8   # Bonus for matching "Rework" variant

        # Generic phrase bonus: +24 if special phrase matches (e.g., "Ivory Re-fire")
        # Penalty: -14 if searching for special phrase but only found plain/original
        gen_bonus = 0
        matched_generic = False
        if input_generic_phrases:
            try:
                matched_generic = _any_phrase_token_set_in_title(input_generic_phrases, title or "")
                if matched_generic:
                    gen_bonus += SETTINGS.get("GENERIC_PHRASE_MATCH_BONUS", 24)
                else:
                    # Penalty when searching for special phrase but only found generic mix
                    if cand_mix.get("is_original") or cand_mix.get("is_extended"):
                        gen_bonus -= SETTINGS.get("GENERIC_PHRASE_PLAIN_PENALTY", 14)
            except Exception:
                pass

        # Calculate final score: base score + all bonuses
        final = comp + yb + kb + mix_bonus + gen_bonus + special_bonus
        
        # ========================================================================
        # SPECIAL BOOSTS: Handle edge cases with intelligent scoring adjustments
        # ========================================================================
        
        # Boost for remix queries with high artist similarity but low title similarity
        # Remix titles often have different formatting (feat. additions, extended remix, etc.)
        # Example: Searching "Never Sleep Again Keinemusik Remix"
        #          Finding "Never Sleep Again (feat. X) Keinemusik Extended Remix"
        #          Title similarity might be low due to extra text, but remixer matches perfectly
        
        if a_sim >= 95:  # Very high artist similarity (95%+)
            if input_mix and input_mix.get("is_remix") and cand_mix.get("is_remix"):
                # Remix to remix with perfect artist match - huge boost
                final += 25
            elif input_mix and input_mix.get("is_remix"):
                # Looking for remix, found something with perfect artist match
                final += 15
            elif input_mix and input_mix.get("is_remix"):
                # Don't boost non-remix matches for remix queries unless title similarity is reasonable
                pass
            elif t_sim >= 10:  # At least some title similarity
                # Perfect artist match - boost even non-remixes (but only if not a remix query)
                final += 20
        
        # CRITICAL FIX: For exact artist matches (100%), heavily penalize wrong artist matches
        # This ensures "The Night is Blue" by Tim Green is preferred over Elenos Jeneral
        if track_artists_for_scoring and artists:
            # Check if we have an exact artist match vs a partial match
            from text_processing import split_artists
            
            input_artist_tokens = set([t.lower() for t in split_artists(track_artists_for_scoring)])
            cand_artist_tokens = set([t.lower() for t in split_artists(artists)])
            
            # If input has specific artist and candidate doesn't match well, penalize
            if len(input_artist_tokens) > 0:
                overlap_count = len(input_artist_tokens & cand_artist_tokens)
                total_input = len(input_artist_tokens)
                
                # If we have specific artist but candidate doesn't match most of them
                if overlap_count < total_input * 0.5 and a_sim < 50:
                    # Significant penalty for wrong artist when we have specific input artist
                    final -= 30
                # If candidate has exact artist match, boost it
                elif overlap_count == total_input and a_sim >= 95 and t_sim >= 50:
                    # Bonus for perfect artist + reasonable title match
                    final += 15
                # Special case: If title is exact match but artist is wrong, still penalize
                # This prevents "The Night is Blue" by Elenos Jeneral from beating Tim Green
                # BUT: Only if artist similarity is very low (< 30), and reduce penalty to avoid rejecting valid matches
                elif t_sim >= 95 and overlap_count == 0 and a_sim < 30:
                    # Exact title but completely wrong artist with very low similarity - moderate penalty
                    final -= 15
        
        if input_mix and input_mix.get("is_remix") and a_sim >= 80 and t_sim < 50:
            # If artist similarity is very high, boost the score even with low title similarity
            # This helps catch remixes that are the same track but with different title formatting
            if cand_mix.get("is_remix"):
                # Additional boost for remix-to-remix matches with high artist sim
                final += 15  # Significant boost
            elif t_sim >= 10:  # At least some title similarity
                final += 10  # Moderate boost
        
        # Note: We rely on the large penalty (-20) from mix_bonus for specific remixer mismatches
        # instead of a strict guard, so that we don't block valid matches when no remixes exist

        # ========================================================================
        # GUARD 3: Title-Only Mode Validation
        # ========================================================================
        # If no artists provided, require very high title similarity (88%+)
        # Without artist information, we must be more strict to avoid false positives
        
        if title_only_mode:
            if not (t_sim >= 88):
                ok = False
                reject_reason = "title_only_too_low"
        else:
            # ========================================================================
            # GUARD 4: Artist Validation
            # ========================================================================
            # Check if candidate has any artist token overlap with input artists
            # OR if candidate title mentions input artist as remixer
            # Reject if no overlap AND artist similarity is very low (< 20%)
            
            overlap = _artist_token_overlap(track_artists_for_scoring, artists or "")
            remix_implies_overlap = title_mentions_input_remix(title, track_artists_for_scoring)

            if not (overlap or remix_implies_overlap):
                if a_sim < 20:  # Very low artist similarity with no token overlap
                    ok = False
                    reject_reason = "guard_artist_sim_no_overlap"

            # ========================================================================
            # GUARD 5: Title Similarity Floor
            # ========================================================================
            # Require minimum title similarity based on context
            # More lenient for remixes (different title formatting)
            # More lenient when artist similarity is high
            
            is_remix_query = input_mix and input_mix.get("is_remix")
            title_floor = 60  # Default minimum title similarity
            
            if is_remix_query:
                # Remixes often have different title formatting (feat. additions, extended, etc.)
                # Example: "Tighter (CamelPhat Remix)" vs "Tighter (feat. Jalja) CamelPhat Extended Remix"
                # Title similarity might be lower due to extra text, but remixer matches
                title_floor = 45  # Lower threshold for remixes
                if (overlap or remix_implies_overlap) and a_sim >= 50:
                    title_floor = 40  # Even lower if artist matches reasonably
                elif a_sim >= 70:
                    title_floor = 35  # Lower still for good artist match
                elif a_sim >= 85:
                    title_floor = 30  # Very lenient for excellent artist match on remixes
            elif (overlap or remix_implies_overlap) and a_sim >= 50:
                # Non-remix but artist matches reasonably well
                title_floor = 55
            elif a_sim >= 70:
                # Good artist match allows lower title similarity
                title_floor = 50
            elif a_sim >= 85:
                # Excellent artist match allows even lower title similarity
                title_floor = 45

            # Reject if title similarity below floor
            if t_sim < title_floor:
                ok = False
                reject_reason = reject_reason or "guard_title_sim_floor"

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

        if input_generic_phrases and matched_generic:
            seen_generic_match = True

        if SETTINGS["TRACE"]:
            tlog(idx, f"[scored] {u} score={final:.1f} ok={ok}")

    # ========================================================================
    # MAIN QUERY EXECUTION LOOP
    # ========================================================================
    # Execute each query in sequence, fetch candidates, score them, check for early exit
    
    for i, q in enumerate(queries, 1):
        last_q_processed = i
        
        # Check query cap (hard limit on number of queries)
        cap = SETTINGS.get("MAX_QUERIES_PER_TRACK")
        if cap and i > int(cap):
            vlog(idx, f"[cap] stopping at {cap} queries")
            break

        # Check time budget (max time to spend on this track)
        budget = SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC")
        elapsed = time.perf_counter() - start
        # Always allow at least the first 5 priority queries to complete
        # Priority queries are the most important (full title + artist)
        min_priority_queries = 5
        if (not SETTINGS.get("RUN_ALL_QUERIES") and budget and elapsed > budget and i > min_priority_queries):
            vlog(idx, "[timeout] per-track budget exceeded")
            break

        remix_like_intent = bool((input_mix and input_mix.get("is_remix")) or (input_generic_phrases))
        if remix_like_intent:
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES_REMIX", 6)
        elif input_mix and input_mix.get("is_original"):
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES_ORIGINAL", 8)
        else:
            min_q_for_exit = SETTINGS.get("EARLY_EXIT_MIN_QUERIES", 12)

        # Execute query to find candidate URLs
        t_q0 = time.perf_counter()
        
        # Adaptive max results: more results for specific queries, fewer for generic
        mr = _pick_max_results_for_query(q)
        
        # Fetch candidate URLs using unified search (DuckDuckGo or direct Beatport)
        # track_urls() automatically chooses the best search method based on query type
        urls_all = track_urls(idx, q, max_results=mr)
        q_elapsed = int((time.perf_counter() - t_q0) * 1000)

        cap = SETTINGS.get("PER_QUERY_CANDIDATE_CAP")
        cap_i = int(cap) if (isinstance(cap, (int, str)) and str(cap).isdigit()) else (cap if isinstance(cap, int) else None)
        urls = urls_all[:cap_i] if (cap_i and cap_i > 0 and len(urls_all) > cap_i) else urls_all

        queries_audit.append((i, q, len(urls_all), q_elapsed))

        print(f"[{idx}]   q{i} -> {len(urls)} candidates (raw={len(urls_all)}, MR={mr})", flush=True)

        cand_index_map = {u: j for j, u in enumerate(urls, start=1)}
        
        # ========================================================================
        # DEDUPLICATION: Filter out already-visited URLs and track IDs
        # ========================================================================
        # Avoid re-fetching/re-parsing the same tracks across multiple queries
        # Beatport URLs format: https://www.beatport.com/track/{slug}/{track_id}
        
        def extract_track_id_from_url(url: str) -> Optional[str]:
            """Extract Beatport track ID from URL (the numeric ID at the end)"""
            match = re.search(r'/track/[^/]+/(\d+)', url)
            return match.group(1) if match else None
        
        to_fetch = []  # URLs that need to be fetched
        skipped_by_id = []  # URLs skipped because we've already parsed this track ID
        
        for u in urls:
            # Skip if we've already fetched this exact URL
            if u in visited_urls:
                continue
            
            # Extract track ID and check if we've already parsed this track
            track_id = extract_track_id_from_url(u)
            if track_id and track_id in visited_track_ids:
                # Already parsed this track ID - we'll use cached data instead
                if track_id in parsed_cache_by_id:
                    skipped_by_id.append((u, track_id))
                continue  # Skip re-parsing (use cache later)
            
            # New URL that we haven't seen - add to fetch list
            to_fetch.append(u)
        
        # Mark URLs as visited and track IDs as parsed
        for u in to_fetch:
            visited_urls.add(u)
            track_id = extract_track_id_from_url(u)
            if track_id:
                visited_track_ids.add(track_id)

        # ========================================================================
        # PARALLEL CANDIDATE FETCHING
        # ========================================================================
        # Fetch and parse candidate tracks in parallel for speed
        
        def fetch(u):
            """
            Fetch and parse a single candidate track
            
            Uses caching to avoid re-parsing the same URL.
            Also caches by track ID to handle URLs with different slugs but same ID.
            
            Returns:
                Tuple of (url, title, artists, key, year, bpm, label, genres, release_name, release_date, elapsed_ms)
            """
            # Check URL cache first
            if u in parsed_cache:
                title, artists, key, year, bpm, label, genres, rel_name, rel_date = parsed_cache[u]
                return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, 0
            
            # Parse the Beatport track page
            t0 = time.perf_counter()
            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parse_track_page(u)
            
            # Cache by URL
            parsed_cache[u] = (title, artists, key, year, bpm, label, genres, rel_name, rel_date)
            
            # Also cache by track ID (same track can appear with different URL slugs)
            track_id = extract_track_id_from_url(u)
            if track_id:
                parsed_cache_by_id[track_id] = (title, artists, key, year, bpm, label, genres, rel_name, rel_date)
            
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, elapsed_ms

        with ThreadPoolExecutor(max_workers=SETTINGS["CANDIDATE_WORKERS"]) as ex:
            futures = [ex.submit(fetch, u) for u in to_fetch]

            if SETTINGS.get("RUN_ALL_QUERIES"):
                for fut in as_completed(futures) if futures else []:
                    try:
                        u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, ems = fut.result()
                    except Exception as e:
                        vlog(idx, f"[fetch-error] {u}: {e}")
                        continue
                    if not title:
                        consider(u, "", "", None, None, None, None, None, None, None, i, q, cand_index_map.get(u, 0), ems)
                        candidates_log[-1].reject_reason = "no_title"
                        candidates_log[-1].guard_ok = False
                        continue
                    consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), ems)
                
                # Handle URLs that were skipped because we've already parsed their track ID
                # Use cached data from parsed_cache_by_id
                for u, track_id in skipped_by_id:
                    if track_id in parsed_cache_by_id:
                        title, artists, key, year, bpm, label, genres, rel_name, rel_date = parsed_cache_by_id[track_id]
                        # Mark URL as visited to avoid re-considering
                        visited_urls.add(u)
                        # Consider this candidate using cached data (no re-parsing needed)
                        consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), 0)
            else:
                join_timeout = max(6, 3 * len(to_fetch))
                try:
                    for fut in as_completed(futures, timeout=join_timeout) if futures else []:
                        try:
                            u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, ems = fut.result()
                        except Exception as e:
                            vlog(idx, f"[fetch-error] {u}: {e}")
                            continue
                        if not title:
                            consider(u, "", "", None, None, None, None, None, None, None, i, q, cand_index_map.get(u, 0), ems)
                            candidates_log[-1].reject_reason = "no_title"
                            candidates_log[-1].guard_ok = False
                            continue
                        consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), ems)
                
                    # Handle URLs that were skipped because we've already parsed their track ID
                    # Use cached data from parsed_cache_by_id
                    for u, track_id in skipped_by_id:
                        if track_id in parsed_cache_by_id:
                            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parsed_cache_by_id[track_id]
                            # Mark URL as visited to avoid re-considering
                            visited_urls.add(u)
                            # Consider this candidate using cached data (no re-parsing needed)
                            consider(u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, i, q, cand_index_map.get(u, 0), 0)
                except FuturesTimeoutError:
                    vlog(idx, f"[warn] candidate fetch join timed out")
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

        # ========================================================================
        # EARLY EXIT CHECK
        # ========================================================================
        # Stop searching if we found an excellent match (saves time)
        # Only applies if RUN_ALL_QUERIES is False and we have a guard-passing candidate
        
        if (not SETTINGS.get("RUN_ALL_QUERIES")) and best and best.guard_ok:
            # Check if special phrase requirement is met
            generic_ok = True
            if input_generic_phrases:
                generic_ok = _any_phrase_token_set_in_title(input_generic_phrases, best.title or "")
            
            # Check if score meets early exit threshold
            if SETTINGS.get("EARLY_EXIT_SCORE") and best.score >= SETTINGS["EARLY_EXIT_SCORE"]:
                # Ensure minimum queries have been executed (avoid premature exit)
                if i >= int(min_q_for_exit or 0):
                    # Check mix type compatibility (unless disabled)
                    mix_ok = (not SETTINGS.get("EARLY_EXIT_REQUIRE_MIX_OK", True)) or _mix_ok_for_early_exit(
                        effective_input_mix, _parse_mix_flags(best.title), best.artists)
                    
                    # Early exit if all conditions met
                    if mix_ok and generic_ok:
                        print(f"[{idx}]   early-exit on q{i}: best score {best.score:.1f}", flush=True)
                        break

    if best:
        for c in candidates_log:
            if c.url == best.url:
                c.is_winner = True
                break

    return best, candidates_log, queries_audit, last_q_processed

