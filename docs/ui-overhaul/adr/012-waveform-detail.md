# ADR-012: Detail waveforms are made on demand and kept in a bounded cache

## Status

Accepted (C13, 2026-10-12). Records DEC-250 as implemented. Amends ADR-010 (a second table in
`waveforms.db`) and ADR-009 (the decode now also feeds the detail).

## Context

The zoomed strip above the player bar (DEC-250) shows about 16 s at once. The overview cannot carry
that: it is 1,200 columns whatever the length, so a 6-minute track gives about 53 columns for 16 s,
and its header counts columns in a `u16`, so even a separate stream at 75 a second would overflow past
14.5 minutes. The decoder already produces a 150-a-second, four-band envelope (ADR-009) and the
service threw it away after reducing it to the overview.

The strip draws one column per scale pixel; the widest likely strip (1,200 units over 16 s) needs 75
columns a second. Measured with the real reduce, encode and compand on a 6-minute envelope:

| Rate | Raw bytes (6 min) | zlib-6 (synthetic) | Est. real music | × 50,000 tracks |
| --- | --- | --- | --- | --- |
| 150/s | 216,000 | 95.7 KB | ~67 KB | ~3.3 GB |
| **75/s** | 108,000 | 49.9 KB | **~35 KB** | **~1.75 GB** |
| 50/s | 72,000 | 34.3 KB | ~24 KB | ~1.2 GB |

ADR-010's whole store budget is 260 MB per 50,000 tracks.

## Decision

- **A separate format, `CPWD`** (`core/waveform_detail.py`): header `<4sBBHII` (magic, version 1,
  4 bands, rate in Hz as `u16`, columns as `u32`, duration in ms), then the planar bands, zlib-6, as
  `CPWF` does. The overview's `CPWF` stays at `FORMAT_VERSION` 1, so no library is analysed again.
  Each detail column is the maximum over its span of the envelope, companded like the overview.
- **On demand.** When a track plays, the renderer asks for its detail; a single-worker queue on the
  analysis coordinator decodes the file once and writes the detail, and the overview too when it was
  missing or stale. A newer request replaces a queued one. It runs while analysis is paused, waits
  for every job in `STEPS_ASIDE_FOR`, and is cancelled when one starts. It is not an Activity job.
- **A bounded cache.** Table `waveform_details` in `waveforms.db`, keyed by path and stamped with the
  file's size and mtime plus the analysis and detail versions, created `IF NOT EXISTS` with no schema
  bump. Each write evicts the least recently used rows (by `used_at`, touched on read) until the table
  holds at most 256 MB, about 5,000 to 7,000 tracks.
- **Deletion.** "Delete waveform data", a prune of removed tracks and `clear` remove details with the
  waveforms. A detail whose file changed is never shown; it is made again on the next play.
- **API.** `GET /api/v1/waveforms/detail?track_id=N` answers the state (`ready`, `working`,
  `waiting`, or the overview's `missing`, `unchecked`, `failed`, `unavailable`) and, when ready, the
  columns as base64; `POST /api/v1/waveforms/detail/request` queues the decode.

Measured (5,000-track bench, p95): reduce and encode a 6-minute detail 37 ms (budget 60), one read
and decode 2.2 ms (budget 20), `put_detail` with eviction at the full cap 8.9 ms (budget 50). The
release check (`fetch_player_sidecar.py --check-analysis`) now also places the fixture's band steps
within one detail column (13 ms) of 2 s and 4 s; the real `mpv` puts them 0 to 1 column late.

## Consequences

- The first play of a track shows the stretched overview for about 1 to 2 s (one `mpv` decode,
  ADR-009), then the detail. A replay is instant until the track falls out of the cache.
- One more `mpv` child may run beside the library analysis, at the same lowered priority.
- The renderer has its first `requestAnimationFrame` loop; it runs only while playing and visible.

## Made ahead (amendment)

The detail is still made on demand, but the renderer now asks for it before play: for the track
selected in a list (after a 300 ms pause in the arrow keys) and for the next track in the queue.
`POST /waveforms/detail/request` takes an optional `low: true`. A low request never replaces a
queued or running wanted one and is turned away (state stays `waiting`) while a wanted decode is
going. A newer low request replaces an older low one, queued or in flight (the newest guess
wins), and a wanted request for another track cancels a low decode in flight. The renderer keeps one
prepare-ahead request in flight, never asks while a view waits for another track, and holds the
results in the same bounded cache. If the detail is still not ready at play, the strip draws the
overview interpolated between its columns, cross-fades to the detail over 150 ms (instant when
Settings, Motion, "State changes" is off). The fade runs its own short `requestAnimationFrame`
loop even while the player is paused (capped at twice the fade, then it stops), so a paused strip
still fades. The next-in-queue guess wraps to the head of the queue when it repeats all; a queue
reordered in place gives no signal, so that guess is refreshed on the next queue change, and notes how long the stand-in was used (a profiler mark and a breadcrumb, no
track identity).

## Signals to revisit

- Users routinely play more than about 6,000 distinct tracks between replays (cache churn): raise
  the cap, or store detail at analysis time behind a setting.
- The release check finds the decoder's delay above one column: compensate in `reduce_detail`.
- A wider strip (for example on a 4K screen at 1x) needing more than 75 columns a second.
