#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Mix and remix parsing utilities

This module extracts mix/remix information from track titles:
- Standard mix types: Original Mix, Extended Mix, Remix, Edit, etc.
- Special variants: Re-fire, Rework, VIP, Dub, etc.
- Remixer names: Extracts who did the remix
- Generic phrases: Custom parenthetical phrases like "(Ivory Re-fire)"

Key functions:
- _parse_mix_flags(): Detects mix type flags from title
- _extract_remix_phrases(): Extracts remix information
- _extract_remixer_names_from_title(): Finds remixer names
- _extract_generic_parenthetical_phrases(): Finds custom phrases
- _mix_bonus(): Calculates scoring bonuses/penalties for mix matches
"""

import html
import re
from typing import Dict, List, Tuple

from cuepoint.core.text_processing import _strip_accents, normalize_text, _word_tokens

# Regular expressions for detecting mix types in titles
MIX_PATTERNS = {
    "original": re.compile(r"\boriginal\s+mix\b", re.I),      # "Original Mix"
    "extended": re.compile(r"\bextended\s+mix\b", re.I),      # "Extended Mix"
    "club":     re.compile(r"\bclub\s+mix\b", re.I),          # "Club Mix"
    "radio":    re.compile(r"\bradio\s+edit\b|\bradio\s+mix\b", re.I),  # "Radio Edit" or "Radio Mix"
    "edit":     re.compile(r"\bedit\b", re.I),                # "Edit"
    "remix":    re.compile(r"\bremix\b", re.I),               # "Remix"
    "dub":      re.compile(r"\bdub\s+mix\b|\bdub\b", re.I),   # "Dub Mix" or "Dub"
    "guitar":   re.compile(r"\bguitar\s+mix\b|\bguitar\b", re.I),  # "Guitar Mix"
    "vip":      re.compile(r"\bvip\b", re.I),               # "VIP"
    "rework":   re.compile(r"\bre[-\s]?work\b", re.I),        # "Rework", "Re-work", "Re work"
    "refire":   re.compile(r"\bre[-\s]?fire\b", re.I),        # "Refire", "Re-fire", "Re fire"
    "acapella": re.compile(r"\bacapella\b", re.I),            # "Acapella"
    "instrumental": re.compile(r"\binstrumental\b", re.I),     # "Instrumental"
}


def _extract_remix_phrases(original_title: str) -> List[str]:
    """Extract remix phrases from title"""
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
    """Extract original mix phrases from title"""
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
    """Extract extended mix phrases from title"""
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
    """Extract artist hints from brackets"""
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
    """Merge name lists into a single string"""
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
    """Split display names string into list"""
    parts = re.split(r'\s*,\s*|\s*&\s*|\s+and\s+|/\s*', s)
    return [p.strip() for p in parts if p and p.strip()]


def _extract_remixer_names_from_title(title: str) -> List[str]:
    """Extract remixer names from title"""
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
            # Prefer exact match when available - give small penalty for mismatch
            # This prevents matching Original when Extended is explicitly requested (and vice versa)
            bonus -= 2  # Small penalty for mismatch
            reason = reason or "mix_orig_ext_mismatch"
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
        elif c_ext:
            # CRITICAL: Extended Remix IS compatible with Remix request
            # Many tracks are listed as "Extended Remix" but are just longer versions of "Remix"
            # Example: "CamelPhat Remix" request should match "CamelPhat Extended Remix"
            itoks = input_mix.get("remixer_tokens", set())
            ctoks = cand_mix.get("remixer_tokens", set())
            # If remixer tokens match, treat extended remix as valid match
            if itoks and ctoks and (itoks & ctoks):
                bonus += 8; reason = "remix_extended_remix_compatible"
            elif not itoks:
                # No specific remixer requested, extended remix is acceptable
                bonus += 2; reason = "remix_extended_remix_compatible"
            else:
                # Remixer mismatch, but still compatible format
                bonus -= 2; reason = reason or "remixer_mismatch_but_compatible_format"
        else:
            # When remix is requested, penalize original/extended/plain mixes
            # Especially if a specific remixer is requested
            itoks = input_mix.get("remixer_tokens", set())
            if itoks:
                # Specific remixer requested but found original/extended - moderate-heavy penalty
                # Large enough to prefer remixes, but not so large as to block all matches
                bonus -= 12; reason = reason or "wanted_specific_remix_got_original"
            else:
                # Remix requested but no specific remixer - moderate penalty
                bonus -= 6; reason = reason or "wanted_remix"

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
        # CRITICAL: Extended Remix IS compatible with Remix request
        # Many tracks are listed as "Extended Remix" but are just longer versions of "Remix"
        if cand_mix.get("is_remix") or cand_mix.get("is_extended"):
            itoks = set(input_mix.get("remixer_tokens", set()))
            if itoks:
                ctoks = set(cand_mix.get("remixer_tokens", set()))
                # 1) Direct remixer token match from candidate title
                if itoks & ctoks:
                    return True
                # 2) Fallback: remixer appears among candidate artists
                artist_tokens = set(re.split(r'\s+', normalize_text(cand_artists or "")))
                return bool(itoks & artist_tokens)
            # remix requested but no specific remixer given → accept any remix or extended remix
            return True
        # Not a remix or extended remix - reject
        return False

    # No explicit mix intent → OK
    return True

