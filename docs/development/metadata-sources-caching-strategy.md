# Strategy for Alternative Metadata Sources and Caching

**Step 12: Future-Proofing** — Strategy for metadata sources and caching.

**Last updated**: 2026-02-03

## Overview

This document defines the strategy for alternative metadata sources (beyond Beatport) and caching to improve resilience, performance, and future expansion.

## 1. Current State

### Metadata Sources

- **Primary**: Beatport (search + parse)
- **Provider abstraction**: Implemented (`src/cuepoint/data/providers.py`)
- **Fallback**: None (Beatport only today)

### Caching

- **HTTP response cache**: requests-cache (Beatport page responses)
- **In-memory cache**: CacheService for match results
- **Self-healing**: Stale cache invalidation when empty result (Design 5.11)

## 2. Alternative Metadata Sources Strategy

### 2.1 Provider Interface

New metadata sources are added by implementing the `SearchProvider` protocol:

```python
class SearchProvider(Protocol):
    def search(self, idx: int, query: str, max_results: int = 50) -> List[str]: ...
    def parse(self, url: str) -> Optional[Dict[str, Any]]: ...
    @property
    def name(self) -> str: ...
```

See `providers.py` docstrings and [Beatport Site Change Plan](beatport-site-change-plan.md) for details.

### 2.2 Candidate Sources (Future)

| Source | Priority | Notes |
| --- | --- | --- |
| **Discogs** | P1 | Rich metadata; API available |
| **MusicBrainz** | P1 | Free, comprehensive |
| **Juno** | P2 | Electronic music focus |
| **Traktor** | P2 | DJ software integration |
| **Spotify** | P3 | Requires API key; licensing considerations |

### 2.3 Provider Selection

- **Config**: `providers.active` (YAML) or `--provider` (CLI)
- **Default**: `beatport`
- **Fallback**: If primary fails repeatedly, consider automatic fallback (future enhancement)

### 2.4 Adding a New Provider

1. Implement `SearchProvider` in `cuepoint/data/`
2. Register in `providers.py` registry
3. Add contract tests in `tests/unit/data/test_providers.py`
4. Add fixtures (HTML/JSON samples) for offline tests
5. Document in provider guide
6. Update [roadmap](../roadmap.md)

## 3. Caching Strategy

### 3.1 HTTP Response Cache

- **Purpose**: Avoid re-fetching Beatport pages for same URL
- **Backend**: SQLite (requests-cache)
- **Location**: User cache dir (platform-specific)
- **Eviction**: TTL-based; configurable
- **Invalidation**: Clear on provider change; self-healing on empty cached result

### 3.2 In-Memory Cache (CacheService)

- **Purpose**: Avoid re-parsing same URL within a run
- **Scope**: Per-run
- **TTL**: Session lifetime

### 3.3 Metadata Result Cache (Future)

- **Purpose**: Persist match results across runs (e.g., track URL → metadata)
- **Key**: Hash of (provider, track_id or URL)
- **Value**: Parsed metadata dict
- **Eviction**: Size limit, LRU, or TTL
- **Consideration**: Beatport URLs may change; use stable IDs when available

### 3.4 Cache Invalidation Rules

| Event | Action |
| --- | --- |
| Provider switch | Clear HTTP cache for that provider |
| Beatport site change detected | Clear HTTP cache; update fixtures |
| Schema migration | N/A (output cache; re-export) |
| Config `enable_cache: false` | Disable HTTP cache for run |

## 4. Offline and Limited Connectivity

- **HTTP cache**: Enables offline re-runs with cached Beatport data
- **Self-healing**: Empty cached result triggers re-fetch when online
- **UX**: "Limited connectivity" message when network unavailable (Design 5.4)

## 5. Data Quality and Consistency

- **Normalization**: Per-provider normalization (casing, whitespace)
- **Required fields**: title, artist, bpm, key (Design 12.71)
- **Optional**: label, genre, release_name, release_date
- **Validation**: Provider contract tests enforce required fields

## 6. Security and Privacy

- **No PII in cache**: Cache stores URLs and parsed metadata only
- **Local storage**: All caches in user-writable paths (not install dir)
- **Network**: Only search queries and page fetches; no telemetry by default

## 7. Metrics and Monitoring

- **Cache hit rate**: Logged (Design 6.9)
- **Provider success rate**: Per-provider (Design 12.78)
- **Latency**: Per-request (Design 12.164)

## 8. References

- [Beatport Site Change Plan](beatport-site-change-plan.md)
- [Provider abstraction](https://github.com/stuchain/CuePoint/blob/main/src/cuepoint/data/providers.py)
- [Schema Migration Guide](../schema/migration-guide.md)
- [Roadmap](../roadmap.md)
