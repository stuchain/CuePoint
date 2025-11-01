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
    title_variations = []
    if original_title and t_clean:
        title_variations.append(original_title)
        title_variations.append(t_clean)

        if original_title != t_clean:
            exact_title = re.sub(r'^\[[\d\-\s]+\]\s*\([^)]*\)\s*', '', original_title)
            exact_title = re.sub(r'\s+', ' ', exact_title).strip()
            if exact_title and exact_title != original_title:
                title_variations.append(exact_title)

        base_title = re.sub(r'^\[[\d\-\s]+\]\s*', '', original_title)
        base_title = re.sub(r'\s*\(F\)\s*', ' ', base_title)
        base_title = re.sub(r'\s*www\.[^\s]+\s*', ' ', base_title)
        base_title = re.sub(r'\s+', ' ', base_title).strip()
        if base_title != original_title:
            title_variations.append(base_title)
            title_variations.append(sanitize_title_for_search(base_title))

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

    # PRIORITY STAGE 0: Full title + "<remixer> remix" first
    remixers_from_title = _extract_remixer_names_from_title(original_title or "") if original_title else []
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

