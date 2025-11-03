# Design: Retry Logic with Exponential Backoff

**Number**: 6  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - Medium Effort  
**Effort**: 3-4 days  
**Impact**: High

---

## 1. Overview

### 1.1 Problem Statement

Network requests can fail due to temporary issues:
- Connection timeouts
- Rate limiting (HTTP 429)
- Server errors (HTTP 5xx)
- Temporary network glitches

Currently, these failures cause tracks to be unmatched, requiring manual re-runs.

### 1.2 Solution Overview

Implement automatic retry logic with exponential backoff:
1. Retry failed requests automatically
2. Exponential backoff between retries (1s, 2s, 4s, 8s)
3. Configurable retry attempts per error type
4. Log retry attempts for debugging
5. Graceful degradation after max retries

---

## 2. Architecture Design

### 2.1 Retry Strategy Flow

```
Network Request
    ↓
Success?
    ├─ Yes → Return Result
    └─ No → Check Retry Eligibility
            ├─ Eligible? → Wait (exponential backoff)
            │              ↓
            │            Retry Request
            │              ↓
            │            Success?
            │              ├─ Yes → Return Result
            │              └─ No → Continue Retry Loop
            └─ Max Retries? → Return Error/Empty
```

### 2.2 Retry Decision Logic

```python
RETRY_STRATEGIES = {
    'ConnectTimeout': {'max_retries': 3, 'backoff_base': 1},
    'ReadTimeout': {'max_retries': 3, 'backoff_base': 1},
    'HTTPError': {
        429: {'max_retries': 5, 'backoff_base': 2},  # Rate limiting
        500: {'max_retries': 3, 'backoff_base': 1},  # Server error
        502: {'max_retries': 3, 'backoff_base': 1},  # Bad gateway
        503: {'max_retries': 5, 'backoff_base': 2},  # Service unavailable
    },
    'ConnectionError': {'max_retries': 3, 'backoff_base': 1},
    'SSLError': {'max_retries': 2, 'backoff_base': 1},
}
```

---

## 3. Implementation Design

### 3.1 Retry Decorator Function

**Location**: `SRC/utils.py` (new module or extend existing)

```python
import time
import random
from functools import wraps
from typing import Callable, Any, Optional

def retry_with_backoff(
    max_retries: int = 3,
    backoff_base: float = 1.0,
    backoff_max: float = 60.0,
    jitter: bool = True
):
    """
    Decorator for automatic retry with exponential backoff
    
    Args:
        max_retries: Maximum number of retry attempts
        backoff_base: Base delay in seconds (doubles each retry)
        backoff_max: Maximum delay in seconds
        jitter: Add random jitter to prevent thundering herd
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    # Check if exception is retryable
                    if not is_retryable(e):
                        raise  # Don't retry non-retryable errors
                    
                    # Don't wait after last attempt
                    if attempt < max_retries:
                        # Calculate backoff delay
                        delay = min(backoff_base * (2 ** attempt), backoff_max)
                        
                        # Add jitter (random 0-25% of delay)
                        if jitter:
                            jitter_amount = random.uniform(0, delay * 0.25)
                            delay += jitter_amount
                        
                        # Log retry attempt
                        vlog(f"Retry {attempt + 1}/{max_retries} after {delay:.1f}s: {type(e).__name__}")
                        
                        time.sleep(delay)
                    else:
                        vlog(f"Max retries ({max_retries}) reached for {func.__name__}")
            
            # All retries exhausted
            raise last_exception
        
        return wrapper
    return decorator
```

### 3.2 Retryable Error Detection

```python
def is_retryable(error: Exception) -> bool:
    """Determine if an error is retryable"""
    from requests.exceptions import (
        ConnectTimeout, ReadTimeout, ConnectionError,
        HTTPError, RequestException
    )
    
    # Network-related errors are retryable
    if isinstance(error, (ConnectTimeout, ReadTimeout, ConnectionError)):
        return True
    
    # HTTP errors - some are retryable
    if isinstance(error, HTTPError):
        status_code = error.response.status_code if hasattr(error, 'response') else None
        if status_code:
            # Retryable status codes
            return status_code in (429, 500, 502, 503, 504)
    
    # SSL errors are usually not retryable
    if isinstance(error, SSLError):
        return False
    
    # Default: don't retry unknown errors
    return False
```

### 3.3 Integration Points

**Beatport HTTP Requests**:
```python
@retry_with_backoff(max_retries=3, backoff_base=1.0)
def request_html(url: str, timeout: Tuple[int, int] = (3, 8)) -> Optional[BeautifulSoup]:
    """Request HTML with automatic retry"""
    response = SESSION.get(url, timeout=timeout)
    response.raise_for_status()
    return BeautifulSoup(response.content, 'html.parser')
```

**API Endpoint Requests**:
```python
@retry_with_backoff(max_retries=3, backoff_base=1.0)
def request_json(url: str) -> Optional[dict]:
    """Request JSON with automatic retry"""
    response = SESSION.get(url, timeout=(3, 8))
    response.raise_for_status()
    return response.json()
```

**Browser Automation**:
```python
@retry_with_backoff(max_retries=2, backoff_base=2.0)
def browser_search(query: str) -> List[str]:
    """Browser search with retry (fewer retries, longer backoff)"""
    # ... browser automation code ...
```

---

## 4. Configuration Options

### 4.1 Settings

```python
SETTINGS = {
    "RETRY_ENABLED": True,                    # Enable/disable retry logic
    "RETRY_MAX_ATTEMPTS": 3,                  # Default max retries
    "RETRY_BACKOFF_BASE": 1.0,                # Base delay (seconds)
    "RETRY_BACKOFF_MAX": 60.0,                # Maximum delay (seconds)
    "RETRY_USE_JITTER": True,                  # Add random jitter
    "RETRY_LOG_ATTEMPTS": True,                # Log retry attempts
    "RETRY_STRATEGIES": {                     # Per-error-type strategies
        "ConnectTimeout": {"max_retries": 3},
        "ReadTimeout": {"max_retries": 3},
        "HTTPError_429": {"max_retries": 5, "backoff_base": 2.0},
        "HTTPError_500": {"max_retries": 3},
    }
}
```

---

## 5. Logging and Monitoring

### 5.1 Retry Logging

```python
def log_retry_attempt(
    func_name: str,
    attempt: int,
    max_retries: int,
    error: Exception,
    delay: float
) -> None:
    """Log retry attempt details"""
    if SETTINGS.get("RETRY_LOG_ATTEMPTS", True):
        vlog(
            f"[RETRY] {func_name}: Attempt {attempt}/{max_retries} "
            f"after {delay:.1f}s delay ({type(error).__name__})"
        )
```

### 5.2 Statistics Tracking

```python
class RetryStats:
    def __init__(self):
        self.total_retries = 0
        self.successful_retries = 0
        self.failed_after_retries = 0
        self.retries_by_error_type = {}
    
    def record_retry(self, error_type: str, success: bool):
        self.total_retries += 1
        if success:
            self.successful_retries += 1
        else:
            self.failed_after_retries += 1
        
        self.retries_by_error_type[error_type] = \
            self.retries_by_error_type.get(error_type, 0) + 1
```

---

## 6. Backoff Algorithms

### 6.1 Exponential Backoff

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s
Attempt 5: wait 16s (capped at max)
```

### 6.2 With Jitter

```
Attempt 1: wait 1.0-1.25s (random)
Attempt 2: wait 2.0-2.5s (random)
Attempt 3: wait 4.0-5.0s (random)
```

### 6.3 Rate Limiting Special Handling

For HTTP 429 (rate limiting):
- Longer initial backoff (2s base instead of 1s)
- More retries (5 instead of 3)
- Respect Retry-After header if present

---

## 7. Error-Specific Strategies

### 7.1 Connection Timeout

- **Retries**: 3
- **Backoff**: 1s base
- **Rationale**: Temporary network issues

### 7.2 Rate Limiting (429)

- **Retries**: 5
- **Backoff**: 2s base
- **Rationale**: Need to wait longer, but can retry more

### 7.3 Server Errors (5xx)

- **Retries**: 3
- **Backoff**: 1s base
- **Rationale**: Server may recover quickly

### 7.4 SSL Errors

- **Retries**: 0-1
- **Rationale**: Usually not retryable, configuration issue

---

## 8. Testing Strategy

### 8.1 Unit Tests

- Test retry decorator with mock failures
- Test backoff calculation
- Test jitter application
- Test error type detection

### 8.2 Integration Tests

- Test with real network (controlled failures)
- Test rate limiting scenarios
- Test timeout scenarios

---

## 9. Performance Considerations

### 9.1 Impact on Processing Time

- **Successful requests**: No additional time
- **Failed requests**: Add backoff delays (1-16s typically)
- **Overall**: Minimal impact for occasional failures

### 9.2 Memory

- Negligible (retry state is minimal)

---

## 10. Benefits

### 10.1 Reliability

- **Handles temporary failures**: Automatic recovery
- **Reduces manual intervention**: Fewer re-runs needed
- **Better success rate**: More matches found

### 10.2 User Experience

- **Fewer unmatched tracks**: Retries catch transient failures
- **More robust**: Works better with unstable networks

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

