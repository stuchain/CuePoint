# Error Handling & Logging Guidelines

## Overview

This document outlines the standardized error handling and logging patterns used throughout the CuePoint application.

## Custom Exception Hierarchy

All application errors should use custom exceptions from `cuepoint.exceptions.cuepoint_exceptions`:

- **`CuePointException`**: Base exception for all CuePoint errors
- **`ProcessingError`**: Errors during track processing
- **`BeatportAPIError`**: Errors from Beatport API operations
- **`ValidationError`**: Data validation errors
- **`ConfigurationError`**: Configuration-related errors
- **`ExportError`**: Export operation errors
- **`CacheError`**: Cache operation errors

### Exception Features

All custom exceptions support:
- **Error codes**: Programmatic error identification
- **Context**: Additional information dictionary
- **Formatted messages**: Human-readable error messages

### Example

```python
from cuepoint.exceptions.cuepoint_exceptions import ProcessingError

raise ProcessingError(
    message="Playlist not found",
    error_code="PLAYLIST_NOT_FOUND",
    context={"playlist_name": "My Playlist", "available_playlists": ["Playlist 1", "Playlist 2"]}
)
```

## Error Handling Patterns

### Pattern 1: Try-Except with Specific Exceptions

```python
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, ProcessingError

def process_track(track: Track) -> TrackResult:
    """Process track with error handling."""
    try:
        candidates = search_beatport(track)
        match = find_best_match(track, candidates)
        return TrackResult(track=track, best_match=match)
    
    except BeatportAPIError as e:
        # Log and handle API errors
        logging_service.error(f"API error: {e}", exc_info=e, extra=e.context)
        # Return empty result or re-raise
        return TrackResult(track=track, best_match=None)
    
    except ProcessingError as e:
        # Log processing errors
        logging_service.error(f"Processing error: {e}", exc_info=e)
        raise  # Re-raise processing errors
```

### Pattern 2: Error Recovery

```python
def fetch_with_retry(url: str, max_retries: int = 3) -> Optional[Dict]:
    """Fetch data with retry logic."""
    for attempt in range(max_retries):
        try:
            return fetch_data(url)
        except BeatportAPIError as e:
            if attempt == max_retries - 1:
                # Last attempt failed
                raise
            # Wait before retry
            time.sleep(2 ** attempt)  # Exponential backoff
    return None
```

### Pattern 3: Graceful Degradation

```python
def process_with_fallback(track: Track) -> TrackResult:
    """Process track with fallback options."""
    try:
        # Try primary method
        return process_track_primary(track)
    except BeatportAPIError:
        try:
            # Fallback to secondary method
            return process_track_secondary(track)
        except Exception:
            # Final fallback: return minimal result
            return TrackResult(
                track=track,
                best_match=None,
                confidence=0.0
            )
```

## Logging Best Practices

### Log Levels

- **DEBUG**: Detailed information for debugging (variable values, execution flow)
- **INFO**: General informational messages (operations started/completed)
- **WARNING**: Warning messages (recoverable issues, deprecated features)
- **ERROR**: Error messages (failures that don't stop execution)
- **CRITICAL**: Critical errors (may stop execution)

### Logging Examples

#### Good Logging

```python
# Structured logging with context
logging_service.info(
    "Processing playlist",
    extra={
        "playlist_file": filepath,
        "track_count": len(tracks)
    }
)

# Error logging with exception info
logging_service.error(
    "Failed to fetch track data",
    exc_info=exception,
    extra={
        "track_url": url,
        "status_code": response.status_code
    }
)
```

#### Bad Logging

```python
# Too verbose
logging_service.debug(f"Variable x = {x}, y = {y}, z = {z}")

# Missing context
logging_service.error("Error occurred")
```

### Service Logging

All services should:
1. Accept `ILoggingService` via dependency injection
2. Log operations at appropriate levels
3. Include context in log messages
4. Log errors before raising exceptions

### Example Service Logging

```python
class MyService:
    def __init__(self, logging_service: ILoggingService):
        self.logging_service = logging_service
    
    def do_operation(self, data: str) -> Result:
        self.logging_service.info(
            "Starting operation",
            extra={"data_length": len(data)}
        )
        
        try:
            result = self._process(data)
            self.logging_service.info("Operation completed successfully")
            return result
        except Exception as e:
            self.logging_service.error(
                f"Operation failed: {e}",
                exc_info=e,
                extra={"data": data}
            )
            raise
```

## Error Handler Usage

The centralized `ErrorHandler` class provides unified error handling:

```python
from cuepoint.utils.error_handler import ErrorHandler

error_handler = ErrorHandler(logging_service)

# Handle error with logging and user notification
error_handler.handle_error(
    exception,
    context={"additional": "context"},
    show_user=True
)

# Execute function with error recovery
result = error_handler.handle_and_recover(
    lambda: risky_operation(),
    default_return=None,
    context={"operation": "risky"}
)
```

## Service-Specific Guidelines

### ProcessorService

- Uses `ProcessingError` for all processing failures
- Logs track processing progress
- Includes track context in errors

### BeatportService

- Uses `BeatportAPIError` for API failures
- Logs search and fetch operations
- Returns `None` for fetch failures (allows processing to continue)

### ExportService

- Uses `ExportError` for export failures
- Logs export operations
- Includes filepath and track count in error context

## Testing Error Handling

When testing error handling:

1. Mock dependencies that can fail
2. Verify exceptions are raised with correct types
3. Verify error context is included
4. Verify errors are logged
5. Test error recovery paths

### Example Test

```python
def test_service_raises_custom_exception():
    """Test that service raises custom exception on failure."""
    service = MyService(logging_service)
    
    with patch("module.risky_operation") as mock:
        mock.side_effect = Exception("Test error")
        
        with pytest.raises(MyCustomError) as exc_info:
            service.do_operation()
        
        assert exc_info.value.error_code == "EXPECTED_CODE"
        assert "context_key" in exc_info.value.context
```

## Migration Checklist

When migrating code to use standardized error handling:

- [ ] Replace generic `Exception` with custom exceptions
- [ ] Add error codes to exceptions
- [ ] Include context in exceptions
- [ ] Replace `print()` with logging
- [ ] Use appropriate log levels
- [ ] Add structured context to log messages
- [ ] Test error handling paths
- [ ] Document error codes and contexts

## Error Codes Reference

| Error Code | Exception Type | Description |
|------------|---------------|-------------|
| `BEATPORT_SEARCH_ERROR` | `BeatportAPIError` | Beatport search failed |
| `EXPORT_CSV_ERROR` | `ExportError` | CSV export failed |
| `EXPORT_JSON_ERROR` | `ExportError` | JSON export failed |
| `EXPORT_EXCEL_ERROR` | `ExportError` | Excel export failed |
| `EXPORT_EXCEL_MISSING_DEPENDENCY` | `ExportError` | openpyxl not installed |
| `PLAYLIST_NOT_FOUND` | `ProcessingError` | Playlist not in XML |
| `FILE_NOT_FOUND` | `ProcessingError` | XML file not found |
| `XML_PARSE_ERROR` | `ProcessingError` | XML parsing failed |
| `VALIDATION_ERROR` | `ValidationError` | Data validation failed |

## See Also

- `src/cuepoint/exceptions/cuepoint_exceptions.py` - Exception definitions
- `src/cuepoint/utils/error_handler.py` - Error handler implementation
- `src/cuepoint/services/logging_service.py` - Logging service implementation
- `src/cuepoint/utils/errors.py` - Error message formatting utilities

