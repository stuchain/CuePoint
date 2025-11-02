#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Matching and scoring logic for Beatport candidates
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
    """Normalize key string"""
    if not k:
        return None
    k = k.strip().lower()
    k = k.replace("maj", "major").replace("min", "minor").replace(" ", "")
    return k


def _significant_tokens(s: str) -> List[str]:
    """Return normalized, meaningful tokens (>=3 chars, not common stopwords)"""
    STOP = {"the", "a", "an", "and", "of", "to", "for", "in", "on", "with", "vs", "x",
            "feat", "ft", "featuring", "mix", "edit", "remix", "version", "club", "radio",
            "original", "extended", "vip", "dub", "rework", "refire", "re-fire"}
    toks = [t for t in re.split(r"\s+", normalize_text(s)) if t]
    return [t for t in toks if len(t) >= 3 and t not in STOP]


def _year_bonus(input_year: Optional[int], cand_year: Optional[int]) -> int:
    """Calculate year matching bonus"""
    if not input_year or not cand_year:
        return 0
    if cand_year == input_year:
        return 2
    if abs(cand_year - input_year) == 1:
        return 1
    return 0


def _key_bonus(input_key: Optional[str], cand_key: Optional[str]) -> int:
    """Calculate key matching bonus"""
    a, b = _norm_key(input_key), _norm_key(cand_key)
    if not a or not b:
        return 0
    if a == b:
        return 2
    if a in NEAR_KEYS and b in NEAR_KEYS[a]:
        return 1
    return 0


def _camelot_key(key: Optional[str]) -> str:
    """Convert 'E Major' / 'E Minor' to Camelot like '12B'/'9A'."""
    if not key:
        return ""
    s = (key or "").strip()
    if not s:
        return ""
    s = s.replace("♭", "b").replace("♯", "#")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("–", "-").replace("—", "-").strip()
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
    """Get confidence label from score"""
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
    
    Returns: (best_candidate, all_candidates, queries_audit, last_query_index)
    """
    start = time.perf_counter()
    best: Optional[BeatportCandidate] = None
    candidates_log: List[BeatportCandidate] = []
    queries_audit: List[Tuple[int, str, int, int]] = []
    last_q_processed = 0

    parsed_cache: Dict[str, Tuple[str, str, Optional[str], Optional[int], Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]] = {}
    visited_urls: set[str] = set()

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
        """Evaluate and score a candidate"""
        nonlocal best, seen_generic_match, best_is_family_shape
        ok = True
        reject_reason = ""
        t_sim, a_sim, comp = score_components(track_title, track_artists_for_scoring, title, artists or "")

        # Guards and scoring logic (simplified but functional)
        in_sig = _significant_tokens(track_title)
        cand_sig = _significant_tokens(title or "")

        if len(in_sig) >= 2:
            shared = set(in_sig) & set(cand_sig)
            coverage = len(shared) / max(1, len(in_sig))
            if coverage < 0.3 and t_sim < 85 and a_sim < 90:  # More lenient: 0.3 coverage, lower thresholds
                ok = False
                reject_reason = "guard_title_token_coverage"

        yb = _year_bonus(input_year, year)
        kb = _key_bonus(input_key, key)

        cand_mix = _parse_mix_flags(title or "")
        mix_bonus, _mix_reason = _mix_bonus(effective_input_mix, cand_mix)

        special_bonus = 0
        if special_intent.get("want_refire"):
            if cand_mix.get("is_refire"):
                special_bonus += 12
        if special_intent.get("want_rework"):
            if cand_mix.get("is_rework"):
                special_bonus += 8

        gen_bonus = 0
        matched_generic = False
        if input_generic_phrases:
            try:
                matched_generic = _any_phrase_token_set_in_title(input_generic_phrases, title or "")
                if matched_generic:
                    gen_bonus += SETTINGS.get("GENERIC_PHRASE_MATCH_BONUS", 24)
                else:
                    if cand_mix.get("is_original") or cand_mix.get("is_extended"):
                        gen_bonus -= SETTINGS.get("GENERIC_PHRASE_PLAIN_PENALTY", 14)
            except Exception:
                pass

        final = comp + yb + kb + mix_bonus + gen_bonus + special_bonus
        
        # Special boost for remix queries when we have high artist similarity but low title similarity
        # This handles cases where the remix title format differs significantly
        # CRITICAL: When artist similarity is 100% (perfect match), accept even with very low title similarity
        # This catches cases like "Never Sleep Again Keinemusik Remix" where the track is found but title format differs
        # BUT: Only apply this boost for remix queries, not for regular tracks (to prevent wrong matches like "Late Night Shopping" for "Night Tales")
        if a_sim >= 95:  # Very high artist similarity
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

        if title_only_mode:
            if not (t_sim >= 88):
                ok = False
                reject_reason = "title_only_too_low"
        else:
            overlap = _artist_token_overlap(track_artists_for_scoring, artists or "")
            remix_implies_overlap = title_mentions_input_remix(title, track_artists_for_scoring)

            if not (overlap or remix_implies_overlap):
                if a_sim < 20:  # Lowered from 25 to 20 for more leniency
                    ok = False
                    reject_reason = "guard_artist_sim_no_overlap"

            # For remix queries, be more lenient with title similarity
            # Remixes often have different title formatting
            is_remix_query = input_mix and input_mix.get("is_remix")
            title_floor = 60  # Lowered from 65 to 60
            if is_remix_query:
                # Much more lenient for remix queries - remixers in title can vary
                title_floor = 50  # Lower base for remixes
                if (overlap or remix_implies_overlap) and a_sim >= 50:
                    title_floor = 45  # Even lower if artist matches
                elif a_sim >= 70:
                    title_floor = 40
                elif a_sim >= 85:
                    title_floor = 35  # Very lenient for high artist sim on remixes
            elif (overlap or remix_implies_overlap) and a_sim >= 50:
                title_floor = 55  # Lowered from 60 to 55
            elif a_sim >= 70:
                title_floor = 50  # Lowered from 55 to 50
            elif a_sim >= 85:  # Very high artist sim allows even lower title
                title_floor = 45

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

    # Main query loop
    for i, q in enumerate(queries, 1):
        last_q_processed = i
        cap = SETTINGS.get("MAX_QUERIES_PER_TRACK")
        if cap and i > int(cap):
            vlog(idx, f"[cap] stopping at {cap} queries")
            break

        budget = SETTINGS.get("PER_TRACK_TIME_BUDGET_SEC")
        elapsed = time.perf_counter() - start
        # Always allow at least the first 5 priority queries to complete
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

        t_q0 = time.perf_counter()
        mr = _pick_max_results_for_query(q)
        # Use unified track_urls which can use direct search or DuckDuckGo based on query type
        urls_all = track_urls(idx, q, max_results=mr)
        q_elapsed = int((time.perf_counter() - t_q0) * 1000)

        cap = SETTINGS.get("PER_QUERY_CANDIDATE_CAP")
        cap_i = int(cap) if (isinstance(cap, (int, str)) and str(cap).isdigit()) else (cap if isinstance(cap, int) else None)
        urls = urls_all[:cap_i] if (cap_i and cap_i > 0 and len(urls_all) > cap_i) else urls_all

        queries_audit.append((i, q, len(urls_all), q_elapsed))

        print(f"[{idx}]   q{i} -> {len(urls)} candidates (raw={len(urls_all)}, MR={mr})", flush=True)

        cand_index_map = {u: j for j, u in enumerate(urls, start=1)}
        to_fetch = [u for u in urls if u not in visited_urls]
        for u in to_fetch:
            visited_urls.add(u)

        def fetch(u):
            if u in parsed_cache:
                title, artists, key, year, bpm, label, genres, rel_name, rel_date = parsed_cache[u]
                return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, 0
            t0 = time.perf_counter()
            title, artists, key, year, bpm, label, genres, rel_name, rel_date = parse_track_page(u)
            parsed_cache[u] = (title, artists, key, year, bpm, label, genres, rel_name, rel_date)
            return u, title, artists, key, year, bpm, label, genres, rel_name, rel_date, int((time.perf_counter() - t0) * 1000)

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

        # Early exit checks
        if (not SETTINGS.get("RUN_ALL_QUERIES")) and best and best.guard_ok:
            generic_ok = True
            if input_generic_phrases:
                generic_ok = _any_phrase_token_set_in_title(input_generic_phrases, best.title or "")
            if SETTINGS.get("EARLY_EXIT_SCORE") and best.score >= SETTINGS["EARLY_EXIT_SCORE"]:
                if i >= int(min_q_for_exit or 0):
                    mix_ok = (not SETTINGS.get("EARLY_EXIT_REQUIRE_MIX_OK", True)) or _mix_ok_for_early_exit(
                        effective_input_mix, _parse_mix_flags(best.title), best.artists)
                    if mix_ok and generic_ok:
                        print(f"[{idx}]   early-exit on q{i}: best score {best.score:.1f}", flush=True)
                        break

    if best:
        for c in candidates_log:
            if c.url == best.url:
                c.is_winner = True
                break

    return best, candidates_log, queries_audit, last_q_processed

