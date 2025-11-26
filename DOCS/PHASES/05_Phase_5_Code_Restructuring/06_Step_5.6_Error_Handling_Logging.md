# Step 5.6: Standardize Error Handling & Logging

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 2-3 days  
**Dependencies**: Step 5.1 (Project Structure), Step 5.2 (Dependency Injection)

---

## Goal

Implement consistent error handling and logging throughout the application. Create a custom exception hierarchy, centralized error handling, and structured logging system.

---

## Success Criteria

- [ ] Custom exception hierarchy created
- [ ] Centralized error handler implemented
- [ ] Structured logging configured
- [ ] All print statements replaced with logging
- [ ] Error context and recovery implemented
- [ ] Logging levels properly used
- [ ] Log rotation configured
- [ ] Error handling patterns documented

---

## Custom Exception Hierarchy

### Exception Base Classes

```python
# src/cuepoint/exceptions/cuepoint_exceptions.py

"""Custom exceptions for CuePoint application."""

class CuePointException(Exception):
    """Base exception for all CuePoint errors."""
    
    def __init__(self, message: str, error_code: str = None, context: dict = None):
        """Initialize exception.
        
        Args:
            message: Human-readable error message.
            error_code: Optional error code for programmatic handling.
            context: Optional dictionary with additional context.
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.context = context or {}
    
    def __str__(self) -> str:
        """Return formatted error message."""
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message

class ProcessingError(CuePointException):
    """Error during track processing."""
    pass

class BeatportAPIError(CuePointException):
    """Error from Beatport API."""
    
    def __init__(self, message: str, status_code: int = None, **kwargs):
        """Initialize API error.
        
        Args:
            message: Error message.
            status_code: HTTP status code if applicable.
        """
        super().__init__(message, **kwargs)
        self.status_code = status_code

class ValidationError(CuePointException):
    """Error in data validation."""
    pass

class ConfigurationError(CuePointException):
    """Error in configuration."""
    pass

class ExportError(CuePointException):
    """Error during export operations."""
    pass

class CacheError(CuePointException):
    """Error in cache operations."""
    pass
```

---

## Centralized Error Handler

### Error Handler Implementation

```python
# src/cuepoint/utils/error_handler.py

"""Centralized error handling."""

from typing import Optional, Callable, Any
from cuepoint.exceptions.cuepoint_exceptions import CuePointException
from cuepoint.services.interfaces import ILoggingService

class ErrorHandler:
    """Centralized error handler."""
    
    def __init__(self, logging_service: ILoggingService):
        """Initialize error handler.
        
        Args:
            logging_service: Service for logging errors.
        """
        self.logging_service = logging_service
        self.error_callbacks: list[Callable[[Exception], None]] = []
    
    def register_callback(self, callback: Callable[[Exception], None]) -> None:
        """Register a callback for error notifications.
        
        Args:
            callback: Function to call when error occurs.
        """
        self.error_callbacks.append(callback)
    
    def handle_error(
        self,
        error: Exception,
        context: Optional[dict] = None,
        show_user: bool = True
    ) -> None:
        """Handle an error.
        
        Args:
            error: The exception that occurred.
            context: Optional context dictionary.
            show_user: Whether to show error to user.
        """
        # Log error
        error_context = context or {}
        if isinstance(error, CuePointException):
            error_context.update(error.context)
        
        self.logging_service.error(
            f"Error: {str(error)}",
            exc_info=error,
            extra=error_context
        )
        
        # Notify callbacks
        for callback in self.error_callbacks:
            try:
                callback(error)
            except Exception as e:
                self.logging_service.error(f"Error in error callback: {e}")
        
        # Show to user if requested
        if show_user:
            self._show_user_error(error)
    
    def _show_user_error(self, error: Exception) -> None:
        """Show error to user (implement based on UI framework)."""
        # This would show a message box or notification
        # Implementation depends on UI framework
        pass
    
    def handle_and_recover(
        self,
        func: Callable,
        default_return: Any = None,
        context: Optional[dict] = None
    ) -> Any:
        """Execute function and handle errors with recovery.
        
        Args:
            func: Function to execute.
            default_return: Value to return on error.
            context: Optional context dictionary.
        
        Returns:
            Function result or default_return on error.
        """
        try:
            return func()
        except Exception as e:
            self.handle_error(e, context, show_user=False)
            return default_return
```

---

## Logging Service Implementation

### Logging Service Interface

```python
# src/cuepoint/services/interfaces.py (addition)

class ILoggingService(ABC):
    """Interface for logging service."""
    
    @abstractmethod
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        pass
    
    @abstractmethod
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        pass
    
    @abstractmethod
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        pass
    
    @abstractmethod
    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        pass
    
    @abstractmethod
    def critical(self, message: str, **kwargs) -> None:
        """Log critical message."""
        pass
```

### Logging Service Implementation

```python
# src/cuepoint/services/logging_service.py

"""Logging service implementation."""

import logging
import logging.handlers
from pathlib import Path
from typing import Optional, Dict, Any
from cuepoint.services.interfaces import ILoggingService

class LoggingService(ILoggingService):
    """Structured logging service."""
    
    def __init__(
        self,
        log_dir: Optional[Path] = None,
        log_level: str = "INFO",
        enable_file_logging: bool = True,
        enable_console_logging: bool = True
    ):
        """Initialize logging service.
        
        Args:
            log_dir: Directory for log files. Defaults to user data dir.
            log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
            enable_file_logging: Whether to log to file.
            enable_console_logging: Whether to log to console.
        """
        self.logger = logging.getLogger("cuepoint")
        self.logger.setLevel(getattr(logging, log_level.upper()))
        
        # Remove existing handlers
        self.logger.handlers.clear()
        
        # Create formatters
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(pathname)s:%(lineno)d'
        )
        console_formatter = logging.Formatter(
            '%(levelname)s - %(message)s'
        )
        
        # File handler with rotation
        if enable_file_logging:
            if log_dir is None:
                log_dir = Path.home() / ".cuepoint" / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            
            file_handler = logging.handlers.RotatingFileHandler(
                log_dir / "cuepoint.log",
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(file_formatter)
            self.logger.addHandler(file_handler)
        
        # Console handler
        if enable_console_logging:
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.INFO)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)
    
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        self._log(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        self._log(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, exc_info=None, **kwargs) -> None:
        """Log error message."""
        self._log(logging.ERROR, message, exc_info=exc_info, **kwargs)
    
    def critical(self, message: str, **kwargs) -> None:
        """Log critical message."""
        self._log(logging.CRITICAL, message, **kwargs)
    
    def _log(self, level: int, message: str, **kwargs) -> None:
        """Internal logging method."""
        extra = kwargs.pop('extra', {})
        self.logger.log(level, message, extra=extra, **kwargs)
```

---

## Error Handling Patterns

### Pattern 1: Try-Except with Specific Exceptions

```python
from cuepoint.exceptions.cuepoint_exceptions import BeatportAPIError, ProcessingError
from cuepoint.utils.error_handler import ErrorHandler

def process_track(track: Track, error_handler: ErrorHandler) -> TrackResult:
    """Process track with error handling."""
    try:
        # Processing logic
        candidates = search_beatport(track)
        match = find_best_match(track, candidates)
        return TrackResult(track=track, best_match=match)
    
    except BeatportAPIError as e:
        error_handler.handle_error(
            e,
            context={"track": track.title, "artist": track.artist},
            show_user=True
        )
        # Return empty result or re-raise
        return TrackResult(track=track, best_match=None)
    
    except ProcessingError as e:
        error_handler.handle_error(e, show_user=False)
        raise  # Re-raise processing errors
    
    except Exception as e:
        # Catch-all for unexpected errors
        error_handler.handle_error(
            ProcessingError(f"Unexpected error processing track: {e}"),
            context={"track": track.title}
        )
        raise
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

---

## Logging Best Practices

### Log Levels

- **DEBUG**: Detailed information for debugging
- **INFO**: General informational messages
- **WARNING**: Warning messages (recoverable issues)
- **ERROR**: Error messages (failures that don't stop execution)
- **CRITICAL**: Critical errors (may stop execution)

### Logging Examples

```python
# Good logging
logger.info("Processing playlist", extra={
    "playlist_file": filepath,
    "track_count": len(tracks)
})

logger.error("Failed to fetch track data", exc_info=True, extra={
    "track_url": url,
    "status_code": response.status_code
})

# Bad logging (too verbose)
logger.debug(f"Variable x = {x}, y = {y}, z = {z}")  # Too detailed

# Good logging (structured)
logger.debug("Processing track", extra={
    "track_id": track.id,
    "track_title": track.title
})
```

---

## Configuration

### Logging Configuration File

**config/logging.yaml:**
```yaml
version: 1
disable_existing_loggers: false

formatters:
  default:
    format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
  detailed:
    format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(pathname)s:%(lineno)d'

handlers:
  console:
    class: logging.StreamHandler
    level: INFO
    formatter: default
    stream: ext://sys.stdout
  
  file:
    class: logging.handlers.RotatingFileHandler
    level: DEBUG
    formatter: detailed
    filename: logs/cuepoint.log
    maxBytes: 10485760  # 10 MB
    backupCount: 5

loggers:
  cuepoint:
    level: DEBUG
    handlers: [console, file]
    propagate: false

root:
  level: WARNING
  handlers: [console]
```

---

## Implementation Checklist

- [ ] Create custom exception hierarchy
- [ ] Implement error handler
- [ ] Implement logging service
- [ ] Configure logging (file, console, rotation)
- [ ] Replace print statements with logging
- [ ] Add error handling to core modules
- [ ] Add error handling to services
- [ ] Add error handling to UI components
- [ ] Implement error recovery patterns
- [ ] Add error context to exceptions
- [ ] Test error handling
- [ ] Test logging output
- [ ] Document error handling patterns
- [ ] Document logging guidelines

---

## Common Issues and Solutions

### Issue 1: Too Much Logging
**Solution**: Use appropriate log levels. Don't log every function call at DEBUG level.

### Issue 2: Not Enough Context
**Solution**: Include relevant context in log messages and exception context.

### Issue 3: Logging Performance
**Solution**: Use appropriate log levels. Consider async logging for high-volume scenarios.

---

## Next Steps

After completing this step:
1. Verify error handling works correctly
2. Review log output quality
3. Test error recovery
4. Proceed to Step 5.7: Code Style & Quality Standards

