# Temporary file with async functions to add to processor.py

def process_track_async(
    idx: int,
    rb: RBTrack,
    settings: Optional[Dict[str, Any]] = None,
    max_concurrent: int = 10
) -> TrackResult:
    """
    Process track using async I/O.
    
    This is an async version of process_track_with_callback that uses async I/O
    for network requests, providing better performance for multi-track processing.
    
    Args:
        idx: Track index
        rb: Rekordbox track object
        settings: Processing settings
        max_concurrent: Maximum concurrent requests
    
    Returns:
        TrackResult object
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_track_with_callback(idx, rb, settings)
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    t0 = time.perf_counter()
    
    # Extract artists, clean title (same logic as sync version)
    original_artists = rb.artists or ""
    title_for_search = sanitize_title_for_search(rb.title)
    artists_for_scoring = original_artists
    
    title_only_search = False
    extracted = False
    
    if not original_artists.strip():
        ex = extract_artists_from_title(rb.title)
        if ex:
            artists_for_scoring, extracted_title = ex
            title_for_search = sanitize_title_for_search(extracted_title)
            extracted = True
        title_only_search = True
    
    # Generate queries
    queries = make_search_queries(
        title_for_search,
        ("" if title_only_search else artists_for_scoring),
        original_title=rb.title
    )
    
    # Extract mix/remix information
    input_mix_flags = _parse_mix_flags(rb.title)
    input_generic_phrases = _extract_generic_parenthetical_phrases(rb.title)
    
    # Create event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create aiohttp session
        async def run_async_matching():
            async with aiohttp.ClientSession() as session:
                # Run async matching
                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                    session=session,
                    idx=idx,
                    track_title=title_for_search,
                    track_artists_for_scoring=artists_for_scoring,
                    title_only_mode=(title_only_search and not extracted),
                    queries=queries,
                    input_year=None,
                    input_key=None,
                    input_mix=input_mix_flags,
                    input_generic_phrases=input_generic_phrases,
                    max_concurrent=max_concurrent
                )
                return best, candlog, queries_audit, stop_qidx
        
        best, candlog, queries_audit, stop_qidx = loop.run_until_complete(run_async_matching())
        
        # Convert to TrackResult (same logic as sync version)
        dur = (time.perf_counter() - t0) * 1000
        
        # Build candidate rows
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
                "candidate_year": str(c.release_year) if c.release_year else "",
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
        
        # Build query rows
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
                "winner_query": is_winner,
                "winner_candidate_index": winner_cand_idx,
                "stop_query": is_stop,
            })
        
        if best:
            m = re.search(r'/track/[^/]+/(\d+)', best.url)
            beatport_track_id = m.group(1) if m else ""
            
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=True,
                beatport_url=best.url,
                beatport_title=best.title,
                beatport_artists=best.artists,
                match_score=best.score,
                title_sim=float(best.title_sim),
                artist_sim=float(best.artist_sim),
                confidence=_confidence_label(best.score),
                beatport_key=best.key,
                beatport_key_camelot=_camelot_key(best.key) or "",
                beatport_year=str(best.release_year) if best.release_year else None,
                beatport_bpm=best.bpm,
                beatport_label=best.label,
                beatport_genres=best.genres,
                beatport_release=best.release_name,
                beatport_release_date=best.release_date,
                beatport_track_id=beatport_track_id,
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index=str(best.query_index),
                search_stop_query_index=str(stop_qidx),
                candidate_index=str(best.candidate_index),
            )
        else:
            return TrackResult(
                playlist_index=idx,
                title=rb.title,
                artist=rb.artists or "",
                matched=False,
                match_score=0.0,
                title_sim=0.0,
                artist_sim=0.0,
                confidence="low",
                candidates=cand_rows,
                queries=queries_rows,
                search_query_index="0",
                search_stop_query_index=str(stop_qidx),
                candidate_index="0",
            )
        
    finally:
        loop.close()


def process_playlist_async(
    xml_path: str,
    playlist_name: str,
    settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[ProgressCallback] = None,
    controller: Optional[ProcessingController] = None,
    max_concurrent_tracks: int = 5,
    max_concurrent_requests: int = 10
) -> List[TrackResult]:
    """
    Process playlist using async I/O with parallel track processing.
    
    Args:
        xml_path: Path to playlist XML file
        playlist_name: Name of playlist
        settings: Processing settings
        progress_callback: Optional progress callback
        controller: Optional controller for cancellation
        max_concurrent_tracks: Maximum tracks to process concurrently
        max_concurrent_requests: Maximum requests per track
    
    Returns:
        List of TrackResult objects
    """
    if not ASYNC_AVAILABLE or not ASYNC_MATCHER_AVAILABLE:
        # Fallback to sync version if async not available
        return process_playlist(xml_path, playlist_name, settings, progress_callback, controller)
    
    # Start performance session
    if PERFORMANCE_AVAILABLE and performance_collector:
        try:
            performance_collector.start_session()
        except Exception:
            pass  # Don't let performance collection errors break processing
    
    # Track processing start time
    processing_start_time = time.perf_counter()
    
    # Use provided settings or fall back to global SETTINGS
    effective_settings = settings if settings is not None else SETTINGS
    
    # Parse Rekordbox XML file to extract tracks and playlists
    try:
        tracks_by_id, playlists = parse_rekordbox(xml_path)
    except FileNotFoundError:
        raise ProcessingError(
            error_type=ErrorType.FILE_NOT_FOUND,
            message=f"XML file not found: {xml_path}",
            details="The specified Rekordbox XML export file does not exist.",
            suggestions=[
                "Check that the file path is correct",
                "Verify the file exists and is readable",
                "Ensure the file path uses forward slashes (/) or escaped backslashes (\\)"
            ],
            recoverable=False
        )
    except Exception as e:
        error_msg = str(e)
        if error_msg.startswith("="):
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=error_msg,
                details=f"Failed to parse XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
        else:
            raise ProcessingError(
                error_type=ErrorType.XML_PARSE_ERROR,
                message=f"XML parsing failed: {error_msg}",
                details=f"Error occurred while parsing XML file: {xml_path}",
                suggestions=[
                    "Verify the XML file is a valid Rekordbox export",
                    "Check that the file is not corrupted",
                    "Try exporting a fresh XML file from Rekordbox"
                ],
                recoverable=False
            )
    
    # Validate that requested playlist exists in the XML
    if playlist_name not in playlists:
        available_playlists = sorted(playlists.keys())
        raise ProcessingError(
            error_type=ErrorType.PLAYLIST_NOT_FOUND,
            message=f"Playlist '{playlist_name}' not found in XML file",
            details=f"Available playlists: {', '.join(available_playlists[:10])}{'...' if len(available_playlists) > 10 else ''}",
            suggestions=[
                "Check the playlist name spelling (case-sensitive)",
                f"Verify '{playlist_name}' exists in your Rekordbox library",
                "Export a fresh XML file from Rekordbox",
                "Choose from available playlists listed above"
            ],
            recoverable=True
        )
    
    # Get track IDs for the requested playlist
    tids = playlists[playlist_name]
    
    # Build list of tracks to process with their playlist indices
    inputs: List[Tuple[int, RBTrack]] = []
    for idx, tid in enumerate(tids, start=1):
        rb = tracks_by_id.get(tid)
        if rb:
            inputs.append((idx, rb))
    
    if not inputs:
        raise ProcessingError(
            error_type=ErrorType.VALIDATION_ERROR,
            message=f"Playlist '{playlist_name}' is empty",
            details="The playlist contains no valid tracks.",
            suggestions=[
                "Verify the playlist has tracks in Rekordbox",
                "Export a fresh XML file from Rekordbox"
            ],
            recoverable=True
        )
    
    # Initialize results list and statistics
    results: List[TrackResult] = []
    matched_count = 0
    unmatched_count = 0
    total_tracks = len(inputs)
    
    # Create event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Process tracks in parallel batches
        for i in range(0, total_tracks, max_concurrent_tracks):
            # Check for cancellation
            if controller and controller.is_cancelled():
                break
            
            batch = inputs[i:i + max_concurrent_tracks]
            
            # Process batch concurrently
            async def process_batch():
                # Create aiohttp session for this batch
                async with aiohttp.ClientSession() as session:
                    # Process all tracks in batch concurrently
                    tasks = []
                    for idx, rb in batch:
                        # Check for cancellation
                        if controller and controller.is_cancelled():
                            break
                        
                        # Create async task for each track using a factory function to capture variables
                        def create_task(track_idx, track_rb):
                            async def process_single_track():
                                # Import here to avoid circular imports
                                from matcher import async_best_beatport_match
                                
                                # Extract artists, clean title (same logic as sync version)
                                original_artists = track_rb.artists or ""
                                title_for_search = sanitize_title_for_search(track_rb.title)
                                artists_for_scoring = original_artists
                                
                                title_only_search = False
                                extracted = False
                                
                                if not original_artists.strip():
                                    ex = extract_artists_from_title(track_rb.title)
                                    if ex:
                                        artists_for_scoring, extracted_title = ex
                                        title_for_search = sanitize_title_for_search(extracted_title)
                                        extracted = True
                                    title_only_search = True
                                
                                # Generate queries
                                queries = make_search_queries(
                                    title_for_search,
                                    ("" if title_only_search else artists_for_scoring),
                                    original_title=track_rb.title
                                )
                                
                                # Extract mix/remix information
                                input_mix_flags = _parse_mix_flags(track_rb.title)
                                input_generic_phrases = _extract_generic_parenthetical_phrases(track_rb.title)
                                
                                # Run async matching
                                best, candlog, queries_audit, stop_qidx = await async_best_beatport_match(
                                    session=session,
                                    idx=track_idx,
                                    track_title=title_for_search,
                                    track_artists_for_scoring=artists_for_scoring,
                                    title_only_mode=(title_only_search and not extracted),
                                    queries=queries,
                                    input_year=None,
                                    input_key=None,
                                    input_mix=input_mix_flags,
                                    input_generic_phrases=input_generic_phrases,
                                    max_concurrent=max_concurrent_requests
                                )
                                
                                # Convert to TrackResult (reuse logic from process_track_async)
                                return _convert_async_match_to_track_result(
                                    track_idx, track_rb, best, candlog, queries_audit, stop_qidx
                                )
                            return process_single_track
                        
                        tasks.append(create_task(idx, rb)())
                    
                    # Wait for all tasks in batch to complete
                    batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Handle results and exceptions
                    valid_results = []
                    for result in batch_results:
                        if isinstance(result, Exception):
                            valid_results.append(None)  # Will be handled below
                        else:
                            valid_results.append(result)
                    
                    return valid_results
            
            batch_results = loop.run_until_complete(process_batch())
            
            # Process batch results
            for j, result in enumerate(batch_results):
                if result is None:
                    # Create error result for failed track
                    idx, rb = batch[j]
                    error_result = TrackResult(
                        playlist_index=idx,
                        title=rb.title,
                        artist=rb.artists or "",
                        matched=False
                    )
                    results.append(error_result)
                    unmatched_count += 1
                else:
                    results.append(result)
                    if result.matched:
                        matched_count += 1
                    else:
                        unmatched_count += 1
                    
                    # Update progress callback
                    if progress_callback:
                        elapsed_time = time.perf_counter() - processing_start_time
                        progress_info = ProgressInfo(
                            completed_tracks=len(results),
                            total_tracks=total_tracks,
                            matched_count=matched_count,
                            unmatched_count=unmatched_count,
                            current_track={
                                'title': result.title,
                                'artists': result.artist
                            },
                            elapsed_time=elapsed_time
                        )
                        try:
                            progress_callback(progress_info)
                        except Exception:
                            pass  # Don't let callback errors break processing
        
        # Sort results by playlist index to maintain order
        results.sort(key=lambda r: r.playlist_index)
        
        return results
        
    finally:
        loop.close()


def _convert_async_match_to_track_result(
    idx: int,
    rb: RBTrack,
    best: Optional[Any],
    candlog: List[Any],
    queries_audit: List[Tuple[int, str, int, int]],
    stop_qidx: int
) -> TrackResult:
    """Convert async match results to TrackResult (reuses logic from process_track_async)"""
    from matcher import _camelot_key, _confidence_label
    
    # Build candidate rows
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
            "candidate_year": str(c.release_year) if c.release_year else "",
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
    
    # Build query rows
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
            "winner_query": is_winner,
            "winner_candidate_index": winner_cand_idx,
            "stop_query": is_stop,
        })
    
    if best:
        m = re.search(r'/track/[^/]+/(\d+)', best.url)
        beatport_track_id = m.group(1) if m else ""
        
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=True,
            beatport_url=best.url,
            beatport_title=best.title,
            beatport_artists=best.artists,
            match_score=best.score,
            title_sim=float(best.title_sim),
            artist_sim=float(best.artist_sim),
            confidence=_confidence_label(best.score),
            beatport_key=best.key,
            beatport_key_camelot=_camelot_key(best.key) or "",
            beatport_year=str(best.release_year) if best.release_year else None,
            beatport_bpm=best.bpm,
            beatport_label=best.label,
            beatport_genres=best.genres,
            beatport_release=best.release_name,
            beatport_release_date=best.release_date,
            beatport_track_id=beatport_track_id,
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index=str(best.query_index),
            search_stop_query_index=str(stop_qidx),
            candidate_index=str(best.candidate_index),
        )
    else:
        return TrackResult(
            playlist_index=idx,
            title=rb.title,
            artist=rb.artists or "",
            matched=False,
            match_score=0.0,
            title_sim=0.0,
            artist_sim=0.0,
            confidence="low",
            candidates=cand_rows,
            queries=queries_rows,
            search_query_index="0",
            search_stop_query_index=str(stop_qidx),
            candidate_index="0",
        )


