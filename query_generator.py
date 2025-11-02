#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Search query generation utilities
"""

import re
from itertools import combinations, permutations
from typing import List, Optional, Tuple

from config import SETTINGS
from mix_parser import (
    _extract_bracket_artist_hints,
    _extract_extended_mix_phrases,
    _extract_generic_parenthetical_phrases,
    _extract_original_mix_phrases,
    _extract_remix_phrases,
    _extract_remixer_names_from_title,
    _parse_mix_flags,
)
from rekordbox import extract_artists_from_title
from text_processing import _word_tokens, normalize_text, sanitize_title_for_search


def _ordered_unique(seq: List[str]) -> List[str]:
    """Remove duplicates while preserving order"""
    seen = set()
    out = []
    for s in seq:
        k = s.lower().strip()
        if k and k not in seen:
            seen.add(k)
            out.append(s.strip())
    return out


def _subset_join(tokens: List[str], max_r: Optional[int] = None) -> List[str]:
    """Generate all combinations of tokens up to max_r"""
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
    """Split artist string into individual artist tokens"""
    parts = re.split(
        r"\s*(?:,|&|/| x | vs | with | feat\.?| ft\.?| featuring )\s*",
        a, flags=re.IGNORECASE
    )
    tokens = [re.sub(r"\s{2,}", " ", p).strip() for p in parts if p and p.strip()]
    seen, unique = set(), []
    for tok in tokens:
        k = tok.lower()
        if k not in seen:
            seen.add(k)
            unique.append(tok)
    return unique


def _title_prefixes(tokens: List[str], k_min: int = 2, k_max: Optional[int] = None) -> List[str]:
    """Generate left-anchored prefixes from tokens"""
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
        seen = set()
        out = []
        for s in seq:
            k = s.lower().strip()
            if k and k not in seen:
                seen.add(k)
                out.append(s.strip())
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
                seen.add(k)
                unique.append(tok)
        return unique

    def _word_tokens_local(s: str) -> List[str]:
        s = normalize_text(s)
        return [t for t in re.split(r"\s+", s) if t]

    def _subset_space_join(tokens: List[str], max_r: Optional[int] = None) -> List[str]:
        if not tokens:
            return []
        out = []
        n = len(tokens)
        upper = n if max_r is None else min(max_r, n)
        for r in range(1, upper + 1):
            for comb in combinations(tokens, r):
                out.append(" ".join(comb))
        return _ordered_unique_local(out)

    # If artists are missing, try to extract them from the original_title
    if (not artists or not artists.strip()) and (original_title or "").strip():
        try:
            ext = extract_artists_from_title(original_title)
        except Exception:
            ext = None
        if ext:
            artists = ext[0]
            if title and re.search(r"\b-\b", title):
                title = ext[1]

    STOP = {"the", "a", "an", "and", "of", "to", "for", "in", "on", "with", "vs", "x",
            "feat", "ft", "featuring", "mix", "edit", "remix", "version"}

    # ---------- title bases ----------
    t_clean = sanitize_title_for_search(title).strip()
    title_bases: List[str] = []

    # Generate multiple variations of the title for better matching
    # NOTE: Only use cleaned titles - never include [F], [3], etc. prefixes in queries
    title_variations = []
    if original_title and t_clean:
        # Always prefer cleaned title - never use original with prefixes
        title_variations.append(t_clean)
        
        # Only add original if it's already clean (no prefixes)
        # Check if original has prefixes like [3], [F], etc.
        has_prefixes = bool(re.search(r'^\[[\d\-\s]+\]|\([A-Za-z]\)', original_title.strip()))
        if not has_prefixes and original_title != t_clean:
            title_variations.append(original_title)

        generic_ph = _extract_generic_parenthetical_phrases(original_title)
        remix_ph = _extract_remix_phrases(original_title)
        extmix_ph = _extract_extended_mix_phrases(original_title)
        origmix_ph = _extract_original_mix_phrases(original_title)

        def _expand_generic_variants(ph: str) -> List[str]:
            variants = [ph]
            n = normalize_text(ph)
            try:
                if re.search(r"\bre\s*[- ]?\s*fire\b", n):
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*fire", "Re-fire", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*fire", "Refire", ph))
                if re.search(r"\bre\s*[- ]?\s*work\b", n):
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*work", "Re-work", ph))
                    variants.append(re.sub(r"(?i)re\s*[- ]?\s*work", "Rework", ph))
            except Exception:
                pass
            out, seen = [], set()
            for v in variants:
                vv = v.strip()
                if vv:
                    k = vv.lower()
                    if k not in seen:
                        seen.add(k)
                        out.append(vv)
            return out

        generic_bases = []
        for ph in generic_ph:
            for v in _expand_generic_variants(ph):
                generic_bases.append(f"{t_clean} ({v})")

        orig_present = bool(origmix_ph)
        title_bases = []

        for var in title_variations:
            if var and var.strip():
                title_bases.append(var.strip())

        if orig_present:
            for var in title_variations:
                if var and var.strip():
                    title_bases.append(f"{var.strip()} (Original Mix)")

        title_bases.extend(generic_bases)

        for var in title_variations:
            if var and var.strip():
                title_bases.extend([f"{var.strip()} ({ph})" for ph in remix_ph])
                title_bases.extend([f"{var.strip()} ({ph})" for ph in extmix_ph])

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
        bi = _title_prefixes(words_all, k_min=2, k_max=2) if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 2 else []
        tri = _title_prefixes(words_all, k_min=3, k_max=3) if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 3 else []
    else:
        uni = [w for w in words_all if w not in STOP] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 1 else []
        bi = [" ".join(words_all[i:i+2]) for i in range(len(words_all)-1)] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 2 else []
        tri = [" ".join(words_all[i:i+3]) for i in range(len(words_all)-2)] if SETTINGS.get("TITLE_GRAM_MAX", 3) >= 3 else []

    def _dedup(seq):
        seen, out = set(), []
        for s in seq:
            k = s.lower()
            if k and k not in seen:
                seen.add(k)
                out.append(s)
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

        if SETTINGS.get("ALLOW_GENERIC_ARTIST_REMIX_HINTS", False) and _parse_mix_flags(original_title or "").get("is_remix"):
            for tok in toks:
                a_variants.append(f"{tok} remix")

        a_variants = _ordered_unique_local([re.sub(r"\s{2,}", " ", v).strip() for v in a_variants if v.strip()])
    else:
        a_variants = [""]

    # ---------- assemble queries ----------
    queries: List[str] = []
    seenq = set()

    def _add(q: str):
        k = q.lower().strip()
        if k and k not in seenq:
            seenq.add(k)
            queries.append(q.strip())

    # Extract remixers and base title
    remixers_from_title = _extract_remixer_names_from_title(original_title or "") if original_title else []
    
    # PRIORITY STAGE -0.5: Use exact original title format for remixes (highest priority)
    # Beatport's own search uses exact title format like "Never Sleep Again (Keinemusik Remix)"
    # This often works better than DuckDuckGo's indexed results
    if remixers_from_title and original_title:
        # For remixes, preserve the full title structure (including remix part)
        # Only remove numeric/bracket prefixes like [3], [F] but keep remix info
        exact_title = original_title.strip()
        # Remove only numeric/bracket prefixes like [3], [8-9], (F) at the start
        exact_title = re.sub(r'^\[[\d\-\s]+\]\s*', '', exact_title, flags=re.IGNORECASE)
        exact_title = re.sub(r'^\s*\([A-Za-z]\)\s*', '', exact_title, flags=re.IGNORECASE)
        exact_title = exact_title.strip()
        
        if exact_title and len(exact_title.split()) >= 2:
            # Try exact format as Beatport would search it (preserving remix)
            _add(f'"{exact_title}"')
            # Also try without quotes (broader)
            _add(exact_title)
            # Try with original artist if available
            if toks:
                for a in toks[:1]:  # First artist
                    if a and a.strip():
                        _add(f'"{exact_title}" {a}')
                        _add(f'{a} "{exact_title}"')
    
    # Extract base title (without remix/extended/etc. suffixes) for better matching
    # Beatport often lists remixes as "Base Title - Original Artist (Remixer Remix)"
    base_title_no_remix = t_clean
    if original_title:
        # Remove remix patterns more aggressively - try multiple strategies
        base = original_title
        
        # Strategy 1: Remove parenthetical patterns containing remix/extended/original mix
        base = re.sub(r'\s*\([^)]*\b(remix|extended\s+mix|original\s+mix|edit|version)\b[^)]*\)', '', base, flags=re.I)
        # Strategy 2: Remove bracket patterns
        base = re.sub(r'\s*\[[^\]]*\b(remix|extended\s+mix|original\s+mix|edit|version)\b[^\]]*\]', '', base, flags=re.I)
        # Strategy 3: Remove any parenthetical that looks like a remix/extended indication
        base = re.sub(r'\s*\([^)]*(?:remix|extended|rework|refire|re-fire|edit)[^)]*\)', '', base, flags=re.I)
        # Strategy 4: Remove standalone remix/extended keywords at the end
        base = re.sub(r'\s+\b(remix|extended\s+mix|original\s+mix|edit|version)\b\s*$', '', base, flags=re.I)
        
        # Clean and sanitize
        base = sanitize_title_for_search(base).strip()
        
        # Ensure we got a meaningful base (at least 3 characters)
        if base and len(base) >= 3 and base != t_clean:
            base_title_no_remix = base
        # If base extraction failed, try using t_clean but remove remix keywords
        elif t_clean:
            base_fallback = re.sub(r'\s+\b(remix|extended\s+mix|original\s+mix|edit|version)\b\s*$', '', t_clean, flags=re.I).strip()
            if base_fallback and len(base_fallback) >= 3:
                base_title_no_remix = base_fallback
    
    # PRIORITY STAGE -0.3: Base title + ALL original artists + remixer/extended (HIGHEST PRIORITY for remixes/extended)
    # This MUST run before single-artist queries to find tracks like "Tighter HOSH CamelPhat Remix" or "Batonga Bontan AMEME Extended Mix"
    # Check for remixers OR extended mix intent
    has_extended_intent = False
    if original_title:
        mix_flags_check = _parse_mix_flags(original_title)
        has_extended_intent = bool(mix_flags_check.get("is_extended"))
    
    if len(toks) >= 2 and (remixers_from_title or has_extended_intent) and base_title_no_remix:
        if remixers_from_title:
            # Remix queries: combine all artists with remixer
            # CRITICAL: Filter out remixers from artist tokens to avoid duplication
            # (e.g., if "CamelPhat" is both an artist and remixer, only include it once)
            toks_for_remix = []
            remixer_tokens_lower_remix = {r.lower().strip() for r in remixers_from_title if r}
            for tok in toks:
                if tok.lower().strip() not in remixer_tokens_lower_remix:
                    toks_for_remix.append(tok)
            # If all artists were filtered out, use original toks (but this shouldn't happen)
            if not toks_for_remix:
                toks_for_remix = toks
            
            for r in remixers_from_title:
                if r and r.strip():
                    # Use filtered artists to avoid duplication
                    all_artists = " ".join(toks_for_remix[:2]) if toks_for_remix else " ".join(toks[:2])
                    if all_artists:  # Only add if we have artists
                        _add(f"{base_title_no_remix} {all_artists} {r}")
                        _add(f"{base_title_no_remix} {all_artists} {r} remix")
                        _add(f"{all_artists} {base_title_no_remix} {r}")
                        _add(f"{all_artists} {r} {base_title_no_remix}")
                        if len(base_title_no_remix.split()) >= 1:
                            _add(f'"{base_title_no_remix}" {all_artists} {r}')
                            _add(f'{all_artists} "{base_title_no_remix}" {r}')
                    # Also try with just the remixer (no artists) if artists were filtered
                    _add(f"{base_title_no_remix} {r}")
                    _add(f"{base_title_no_remix} {r} remix")
                    if len(base_title_no_remix.split()) >= 1:
                        _add(f'"{base_title_no_remix}" {r}')
                        _add(f'"{base_title_no_remix}" {r} remix')
        
        if has_extended_intent and len(toks) >= 2:
            # Extended mix queries: combine ALL artists together for better matching
            # Example: "Batonga Bontan AMEME Don Bello Ni Extended Mix"
            all_artists_full = " ".join(toks[:3]) if len(toks) >= 3 else " ".join(toks[:2])
            # Try with all artists first (most specific)
            _add(f"{base_title_no_remix} {all_artists_full}")
            _add(f"{all_artists_full} {base_title_no_remix}")
            # Try with extended mix suffix
            _add(f"{base_title_no_remix} {all_artists_full} Extended Mix")
            _add(f"{base_title_no_remix} {all_artists_full} Extended")
            _add(f"{all_artists_full} {base_title_no_remix} Extended Mix")
            if len(base_title_no_remix.split()) >= 1:
                _add(f'"{base_title_no_remix}" {all_artists_full}')
                _add(f'{all_artists_full} "{base_title_no_remix}"')
                _add(f'"{base_title_no_remix}" {all_artists_full} Extended Mix')
            
            # Also try with just first 2 artists (for compatibility)
            all_artists_pair = " ".join(toks[:2])
            _add(f"{base_title_no_remix} {all_artists_pair}")
            _add(f"{all_artists_pair} {base_title_no_remix}")
            _add(f"{base_title_no_remix} {all_artists_pair} Extended Mix")
            if len(base_title_no_remix.split()) >= 1:
                _add(f'"{base_title_no_remix}" {all_artists_pair}')
                _add(f'{all_artists_pair} "{base_title_no_remix}" Extended Mix')
    
    # PRIORITY STAGE 0: Base title (without remix) + ORIGINAL ARTIST first
    # This is MORE reliable than quoted queries for DuckDuckGo
    # This is crucial because Beatport often lists remixes with base title + original artist
    # CRITICAL: Exclude remixers from artist tokens to avoid duplication
    # (e.g., if "CamelPhat" is both an artist and remixer, don't duplicate it)
    toks_filtered = []
    if remixers_from_title:
        remixer_tokens_lower = {r.lower().strip() for r in remixers_from_title if r}
        for tok in toks:
            if tok.lower().strip() not in remixer_tokens_lower:
                toks_filtered.append(tok)
        # Only use filtered tokens if we removed something (otherwise use original toks)
        if len(toks_filtered) < len(toks):
            toks_for_stage0 = toks_filtered if toks_filtered else toks
        else:
            toks_for_stage0 = toks
    else:
        toks_for_stage0 = toks
    
    if toks_for_stage0 and base_title_no_remix and base_title_no_remix != "":
        # Try each original artist with base title first
        for a in toks_for_stage0:
            if a and a.strip():
                _add(f"{base_title_no_remix} {a}")
                _add(f"{a} {base_title_no_remix}")
        
        # Try two-artist combinations with base title
        if len(toks_for_stage0) >= 2:
            for a1, a2 in combinations(toks_for_stage0, 2):
                _add(f"{base_title_no_remix} {a1} {a2}")
                _add(f"{base_title_no_remix} {a1} & {a2}")
                _add(f"{a1} {a2} {base_title_no_remix}")
    
    # PRIORITY STAGE 0.25: Base title + original artist + "Original Mix" if present in title
    # This ensures queries like "Bass Bousa Original Mix" are generated for direct search
    if original_title and base_title_no_remix:
        input_mix_flags = _parse_mix_flags(original_title)
        if input_mix_flags.get("is_original") and toks:
            for a in toks[:2]:  # First 2 artists
                if a and a.strip():
                    _add(f"{base_title_no_remix} {a} Original Mix")
                    _add(f"{base_title_no_remix} Original Mix {a}")
                    _add(f"{a} {base_title_no_remix} Original Mix")
                    if len(base_title_no_remix.split()) >= 1:
                        _add(f'"{base_title_no_remix}" {a} Original Mix')
                        _add(f'{a} "{base_title_no_remix}" Original Mix')
    
    # PRIORITY STAGE 0.3: Base title + original artist + remixer (all together)
    # Beatport sometimes lists as "Title OriginalArtist (Remixer Remix)"
    # Use quoted queries for better precision on remix searches
    if toks and remixers_from_title and base_title_no_remix:
        for a in toks[:2]:  # Use first 2 artists (for multi-artist tracks like "HOSH, CamelPhat")
            if a and a.strip():
                for r in remixers_from_title:
                    if r and r.strip():
                        # Quoted title for precision
                        if len(base_title_no_remix.split()) >= 1:
                            _add(f'"{base_title_no_remix}" {a} {r} remix')
                            _add(f'"{base_title_no_remix}" {a} {r}')
                            _add(f'{a} "{base_title_no_remix}" {r} remix')
                        # Unquoted variants (broader)
                        _add(f"{base_title_no_remix} {a} {r}")
                        _add(f"{base_title_no_remix} {a} {r} remix")
                        _add(f"{a} {base_title_no_remix} {r}")
                        _add(f"{r} {base_title_no_remix} {a}")
        
    # PRIORITY STAGE 0.5: Base title + remixer (but after original artist)
    # Use quoted queries for better precision when searching for specific remixes
    if remixers_from_title and base_title_no_remix:
        for r in remixers_from_title:
            if r and r.strip():
                # Unquoted variants (broader search)
                _add(f"{base_title_no_remix} {r}")
                _add(f"{r} {base_title_no_remix}")
                # Quoted variants for better precision (remix-specific)
                if len(base_title_no_remix.split()) >= 1:  # Quote if at least one word
                    _add(f'"{base_title_no_remix}" {r} remix')
                    _add(f'"{base_title_no_remix}" {r}')
                # Also try with "remix" suffix (unquoted)
                _add(f"{base_title_no_remix} {r} remix")
                if SETTINGS.get("REVERSE_REMIX_HINTS", True):
                    _add(f"{r} remix {base_title_no_remix}")
                    if len(base_title_no_remix.split()) >= 1:
                        _add(f'{r} remix "{base_title_no_remix}"')

    # PRIORITY STAGE 0.75: Full title with remix + "<remixer> remix" variants
    if remixers_from_title:
        for tb in title_bases:
            for r in remixers_from_title:
                rr_variants = [
                    f"{r} remix",
                    f"{r} remix original mix",
                    f"{r} extended remix",
                    f"{r} extended mix",
                ]
                for rr in rr_variants:
                    if rr.strip():
                        _add(f"{tb} {rr}")
                        if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_REMIX_HINTS", True):
                            _add(f"{rr} {tb}")

    # PRIORITY STAGE 0.8: Quoted full title variations (lower priority - often returns wrong results)
    # Only quote multi-word titles, and only try a few
    for tb in title_bases[:2]:  # Try first 2 title variations only
        if tb and tb.strip():
            title_words = len(tb.split())
            if title_words >= 2:  # Only quote multi-word titles
                # Quoted exact title (but lower priority - base title + artist is more reliable)
                _add(f'"{tb}"')
                # Quoted title + artist
                if toks:
                    for a in toks[:1]:  # First artist
                        if a and a.strip():
                            _add(f'"{tb}" {a}')
                            _add(f'{a} "{tb}"')

    # PRIORITY STAGE 1: Full title + ONE artist, then + TWO-artist subsets
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
            seen_pairs.add(key)
            two_artist_subsets.append((a1, a2))

    for tb in title_bases:
        tb_tokens = _word_tokens_local(tb)
        has_parens = ("(" in tb) or (")" in tb)
        single_word_title = len(tb_tokens) == 1
        tb_q = f'"{tb}"' if (SETTINGS.get("QUOTED_TITLE_VARIANT", False) and (has_parens or single_word_title)) else None

        for a in single_artists:
            _add(f"{tb} {a}")
            _add(f"{_Q(tb)} {a}")
            if tb_q:
                _add(f"{tb_q} {a}")
            if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_ORDER_QUERIES", False):
                _add(f"{a} {tb}")
                _add(f"{a} {_Q(tb)}")
                if tb_q:
                    _add(f"{a} {tb_q}")

        for (a1, a2) in two_artist_subsets:
            for a in (f"{a1} {a2}", f"{a1} & {a2}"):
                _add(f"{tb} {a}")
                _add(f"{_Q(tb)} {a}")
                if tb_q:
                    _add(f"{tb_q} {a}")
                if SETTINGS.get("PRIORITY_REVERSE_STAGE", True) or SETTINGS.get("REVERSE_ORDER_QUERIES", False):
                    _add(f"{a} {tb}")
                    _add(f"{a} {_Q(tb)}")
                    if tb_q:
                        _add(f"{a} {tb_q}")

    # (1) Full title bases × artist variants
    for tb in title_bases:
        for av in a_variants:
            if av:
                for q in (f"{tb} {av}", f"{tb} {_Q(av)}", f"{_Q(tb)} {av}", f"{_Q(tb)} {_Q(av)}"):
                    _add(q)
                allow_rev = SETTINGS.get("REVERSE_ORDER_QUERIES", False)
                if (not allow_rev) and SETTINGS.get("REVERSE_REMIX_HINTS", True):
                    av_key = av.lower().strip()
                    if (av_key in (set(v.lower().strip() for v in remixers_from_title or [])) or 
                        re.search(r"\bremix\b", av_key, flags=re.I)):
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

        if SETTINGS.get("CROSS_TITLE_GRAMS_WITH_ARTISTS", True):
            if SETTINGS.get("CROSS_SMALL_ONLY", True):
                uni_small = [w for w in words_all if w not in STOP]
                bi_small = [" ".join(words_all[i:i+2]) for i in range(len(words_all)-1)]
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

    # Apply cap if configured
    max_queries = SETTINGS.get("MAX_QUERIES_PER_TRACK", 200)
    if max_queries and len(queries) > max_queries:
        queries = queries[:max_queries]

    return queries

