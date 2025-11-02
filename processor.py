#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Track processing orchestration
"""

import csv
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple

from config import HAVE_CACHE, SETTINGS
from matcher import _camelot_key, _confidence_label, best_beatport_match
from mix_parser import _extract_generic_parenthetical_phrases, _parse_mix_flags
from query_generator import make_search_queries
from rekordbox import RBTrack, extract_artists_from_title, parse_rekordbox
from text_processing import _artist_token_overlap, sanitize_title_for_search
from utils import with_timestamp


def process_track(idx: int, rb: RBTrack) -> Tuple[Dict[str, str], List[Dict[str, str]], List[Dict[str, str]]]:
    """Process a single track and return match results"""
    t0 = time.perf_counter()

    original_artists = rb.artists or ""
    # Clean the title right away to remove [F], [3], etc. - never use original with prefixes for search/scoring
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists

    title_only_search = False
    extracted = False

    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            # Clean the extracted title too
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True

    clean_title_for_log = title_for_search  # Already cleaned above
    try:
        print(f"[{idx}] Searching Beatport for: {clean_title_for_log} - {original_artists or artists_for_scoring}", flush=True)
    except UnicodeEncodeError:
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
            safe_q = q.encode('ascii', 'ignore').decode('ascii')
            print(f"[{idx}]     {i}. site:beatport.com/track {safe_q}", flush=True)

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
        try:
            print(f"[{idx}] -> Match: {best.title} - {best.artists} "
                  f"(key {best.key or '?'}, year {best.release_year or '?'}) "
                  f"(score {best.score:.1f}, t_sim {best.title_sim}, a_sim {best.artist_sim}) "
                  f"[q{best.query_index}/cand{best.candidate_index}, {dur:.0f} ms]", flush=True)
        except UnicodeEncodeError:
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
            pass
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
    """Main processing function"""
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

    processed_beatport_ids: set[str] = set()

    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))

    if SETTINGS["TRACK_WORKERS"] > 1:
        with ThreadPoolExecutor(max_workers=SETTINGS["TRACK_WORKERS"]) as ex:
            for main_row, cand_rows, query_rows in ex.map(lambda args: process_track(*args), inputs):
                beatport_id = main_row.get("beatport_track_id", "")
                if beatport_id and beatport_id in processed_beatport_ids:
                    print(f"[SKIP] Duplicate Beatport ID {beatport_id} for track: {main_row.get('original_title', '')}", flush=True)
                    continue

                if beatport_id:
                    processed_beatport_ids.add(beatport_id)

                rows.append(main_row)
                all_candidates.extend(cand_rows)
                all_queries.extend(query_rows)
    else:
        for args in inputs:
            main_row, cand_rows, query_rows = process_track(*args)

            beatport_id = main_row.get("beatport_track_id", "")
            if beatport_id and beatport_id in processed_beatport_ids:
                print(f"[SKIP] Duplicate Beatport ID {beatport_id} for track: {main_row.get('original_title', '')}", flush=True)
                continue

            if beatport_id:
                processed_beatport_ids.add(beatport_id)

            rows.append(main_row)
            all_candidates.extend(cand_rows)
            all_queries.extend(query_rows)

    # Create output directory if it doesn't exist
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)

    # Generate output file paths in the output directory
    base_filename = with_timestamp(out_csv_base)
    out_main = os.path.join(output_dir, base_filename)
    out_review = os.path.join(output_dir, re.sub(r"\.csv$", "_review.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review.csv")
    out_cands = os.path.join(output_dir, re.sub(r"\.csv$", "_candidates.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_candidates.csv")
    out_queries = os.path.join(output_dir, re.sub(r"\.csv$", "_queries.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_queries.csv")

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
    review_indices = set()
    for r in rows:
        score = float(r.get("match_score", "0") or 0)
        artist_sim = int(r.get("artist_sim", "0") or 0)
        artists_present = bool((r.get("original_artists") or "").strip())
        reason = []
        if score < 70:  # Lowered from 85 to 70 to match MIN_ACCEPT_SCORE
            reason.append("score<70")
        if artists_present and artist_sim < 35:
            if not _artist_token_overlap(r.get("original_artists", ""), r.get("beatport_artists", "")):
                reason.append("weak-artist-match")
        if (r.get("beatport_url") or "").strip() == "":
            reason.append("no-candidates")
        if reason:
            rr = dict(r)
            rr["review_reason"] = ",".join(reason)
            review_rows.append(rr)
            review_indices.add(int(r.get("playlist_index", "0")))

    if review_rows:
        with open(out_review, "w", newline="", encoding="utf-8") as f2:
            writer2 = csv.DictWriter(f2, fieldnames=main_fields + ["review_reason"])
            writer2.writeheader()
            writer2.writerows(review_rows)
        print(f"Review list: {len(review_rows)} rows -> {out_review}")

    cand_fields = [
        "playlist_index", "original_title", "original_artists",
        "candidate_url", "candidate_track_id", "candidate_title", "candidate_artists",
        "candidate_key", "candidate_key_camelot", "candidate_year", "candidate_bpm", "candidate_label", "candidate_genres",
        "candidate_release", "candidate_release_date",
        "title_sim", "artist_sim", "base_score", "bonus_year", "bonus_key", "final_score",
        "guard_ok", "reject_reason", "search_query_index", "search_query_text", "candidate_index", "elapsed_ms", "winner",
    ]

    review_candidates = [c for c in all_candidates if int(c.get("playlist_index", "0")) in review_indices]
    if review_candidates:
        base_review_cands = re.sub(r"\.csv$", "_review_candidates.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review_candidates.csv"
        out_review_cands = os.path.join(output_dir, base_review_cands)
        with open(out_review_cands, "w", newline="", encoding="utf-8") as fc:
            wc = csv.DictWriter(fc, fieldnames=cand_fields)
            wc.writeheader()
            wc.writerows(review_candidates)
        print(f"Review candidates: {len(review_candidates)} rows -> {out_review_cands}")

    queries_fields = [
        "playlist_index", "original_title", "original_artists",
        "search_query_index", "search_query_text", "candidate_count", "elapsed_ms",
        "is_winner", "winner_candidate_index", "is_stop"
    ]

    review_queries = [q for q in all_queries if int(q.get("playlist_index", "0")) in review_indices]
    if review_queries:
        base_review_queries = re.sub(r"\.csv$", "_review_queries.csv", base_filename) if base_filename.lower().endswith(".csv") else base_filename + "_review_queries.csv"
        out_review_queries = os.path.join(output_dir, base_review_queries)
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
        with open(out_queries, "w", newline="", encoding="utf-8") as fq:
            wq = csv.DictWriter(fq, fieldnames=queries_fields)
            wq.writeheader()
            wq.writerows(all_queries)
        print(f"Queries: {len(all_queries)} rows -> {out_queries}")

    print(f"\nDone. Wrote {len(rows)} rows -> {out_main}")

