# DI Integration Test Timeout Remediation

This document describes the `test_processor_service_process_track` timeout failure and the fix applied.

## Error Summary

**Test:** `SRC/tests/integration/test_di_integration.py::TestDIIntegration::test_processor_service_process_track`

**Symptom:** Test times out after 120 seconds (pytest-timeout).

**Root cause:** The test invokes `processor.process_track()`, which performs real network operations:

1. **DDG (DuckDuckGo)** – `ddg_track_urls()` calls Bing search API with rate-limiting sleep (0.75s between requests)
2. **Beatport direct** – HTTP search to beatport.com
3. **Beatport browser** – Selenium-based search when direct returns empty

The matcher runs multiple queries (artist+title, title only, etc.), each triggering DDG → direct → browser fallback. With DDG returning 0 results, every query falls through to Selenium, causing many slow browser operations and exceeding the 120s timeout.

## Call Stack (from failure)

```
processor.process_track(1, track)
  → matcher_service.find_best_match()
    → best_beatport_match() [core/matcher.py]
      → track_urls(idx, q, max_results=mr) [data/beatport.py]
        → ddg_track_urls() → DDGS.text() → _get_url() → _sleep()  # timeout here
        → beatport_search_direct()
        → beatport_search_browser()  # Selenium
```

## Fix Applied

**Approach:** Mock the matcher so the test verifies DI wiring and processor flow without network calls.

**Implementation (v2 – most reliable):** Patch `find_best_match` on the processor's matcher service to return a no-match result. This guarantees no DDG, direct, or Selenium code runs.

```python
def test_processor_service_process_track(self):
    """Test that processor service can process a track (mocked matcher to avoid network)."""
    processor = self.container.resolve(IProcessorService)
    with patch.object(processor.matcher_service, "find_best_match", return_value=(None, [], [], 0)):
        track = Track(track_id="1", title="Test Track", artist="Test Artist")
        result = processor.process_track(1, track)
    assert result is not None
    ...
```

**Implementation (v1 – patch track_urls):** Patch `cuepoint.core.matcher.track_urls` to return `[]`. This can fail if the patch target is not applied before the matcher runs (e.g. import order, lazy loading). **v2 is preferred** because it patches the instance method used by the processor, guaranteeing no network code runs.

## Verification

- Test purpose: Verify DI container resolves `IProcessorService` and `process_track()` returns a valid `TrackResult` with expected fields.
- With `track_urls` returning `[]`, the matcher returns no match; the processor still builds a valid `TrackResult` (matched=False) with `playlist_index`, `title`, `artist` set.
- Assertions remain: `result is not None`, `playlist_index == 1`, `title == "Test Track"`, `artist == "Test Artist"`.

## Alternative Approaches (not used)

| Approach | Pros | Cons |
|----------|------|------|
| Patch `ddg_track_urls` | Stops DDG only | Direct and browser still run |
| Patch `beatport_search_browser` | Stops Selenium | DDG and direct still run |
| Patch `matcher_service.find_best_match` | Stops all search | Bypasses matcher entirely; less integration coverage |
| Increase timeout | Simple | Slow CI; flaky on slow runners |

## Related

- `test_processor_service_integration.py` uses the same `track_urls` patch via `_mock_track_urls` fixture
- Integration tests that need real Beatport/DDG should be marked `@pytest.mark.slow` and excluded from default CI
