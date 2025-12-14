#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Networking Reliability System

Implements Step 6.4 - Networking Reliability with:
- Timeout policies
- Retry with exponential backoff
- Network state detection
- Rate limiting
"""

import logging
import random
import socket
import time
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, Optional, Protocol, TypeVar

try:
    import requests
    from requests.adapters import HTTPAdapter
    from requests.exceptions import ConnectionError, HTTPError, RequestException, SSLError, Timeout
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

T = TypeVar('T')


@dataclass
class TimeoutConfig:
    """Network timeout configuration.
    
    Implements Step 6.4.1.1 - Timeout Configuration.
    """
    connect: float = 5.0  # Connection timeout in seconds
    read: float = 30.0     # Read timeout in seconds
    total: Optional[float] = 60.0  # Total timeout (None = no limit)
    
    @classmethod
    def for_search(cls) -> 'TimeoutConfig':
        """Timeout config for search operations."""
        return cls(connect=5.0, read=45.0, total=90.0)
    
    @classmethod
    def for_quick_check(cls) -> 'TimeoutConfig':
        """Timeout config for quick checks."""
        return cls(connect=5.0, read=10.0, total=20.0)
    
    @classmethod
    def for_download(cls) -> 'TimeoutConfig':
        """Timeout config for file downloads."""
        return cls(connect=5.0, read=60.0, total=300.0)  # 5 minutes for downloads


class NetworkConfig:
    """Network configuration manager."""
    
    _default_timeout = TimeoutConfig()
    _search_timeout = TimeoutConfig.for_search()
    _quick_timeout = TimeoutConfig.for_quick_check()
    _download_timeout = TimeoutConfig.for_download()
    
    @staticmethod
    def get_timeout(operation_type: str = "default") -> TimeoutConfig:
        """Get timeout configuration for operation type.
        
        Args:
            operation_type: "default", "search", "quick", "download"
            
        Returns:
            TimeoutConfig instance
        """
        configs = {
            "default": NetworkConfig._default_timeout,
            "search": NetworkConfig._search_timeout,
            "quick": NetworkConfig._quick_timeout,
            "download": NetworkConfig._download_timeout,
        }
        return configs.get(operation_type, NetworkConfig._default_timeout)


@dataclass
class RetryConfig:
    """Retry configuration.
    
    Implements Step 6.4.2.1 - Exponential Backoff Implementation.
    """
    max_retries: int = 3
    base_delay: float = 0.5
    max_delay: float = 10.0
    jitter_range: float = 0.25
    exponential_base: float = 2.0
    
    # HTTP status codes that should trigger retry
    retry_status_codes = {500, 502, 503, 504, 429}
    
    # Exceptions that should trigger retry
    if REQUESTS_AVAILABLE:
        retry_exceptions = (
            ConnectionError,
            Timeout,
            HTTPError,
        )
    else:
        # Fallback to base Exception if requests not available
        retry_exceptions = (Exception,)
    
    def __post_init__(self):
        """Initialize retry exceptions after dataclass creation."""
        # Ensure ConnectionError is always available for testing
        if not REQUESTS_AVAILABLE:
            # Add built-in ConnectionError if available
            import builtins
            if hasattr(builtins, 'ConnectionError'):
                self.retry_exceptions = (builtins.ConnectionError, Exception)


class RetryCallback(Protocol):
    """Protocol for retry callbacks."""
    def on_retry(self, attempt: int, max_attempts: int, delay: float, error: Exception) -> None:
        """Called when retry occurs."""
        ...


class RetryTracker:
    """Track retry attempts for UI feedback.
    
    Implements Step 6.4.2.2 - Retry State Tracking.
    """
    
    def __init__(self, callback: Optional[RetryCallback] = None):
        self.callback = callback
        self.attempts = 0
        self.total_delay = 0.0
    
    def on_retry(self, attempt: int, max_attempts: int, delay: float, error: Exception):
        """Handle retry event."""
        self.attempts += 1
        self.total_delay += delay
        
        if self.callback:
            self.callback.on_retry(attempt, max_attempts, delay, error)


def exponential_backoff(
    func: Optional[Callable[..., T]] = None,
    config: Optional[RetryConfig] = None,
    tracker: Optional[RetryTracker] = None
) -> Callable[..., T]:
    """Decorator for exponential backoff retry.
    
    Implements Step 6.4.2.1 - Exponential Backoff Implementation.
    
    Can be used as:
        @exponential_backoff
        def func(): ...
        
        @exponential_backoff(config=RetryConfig(), tracker=tracker)
        def func(): ...
    
    Args:
        func: Function to wrap (None if used with arguments)
        config: Retry configuration
        tracker: Retry tracker for UI feedback
        
    Returns:
        Wrapped function with retry logic
    """
    def decorator(f: Callable[..., T]) -> Callable[..., T]:
        if config is None:
            retry_config = RetryConfig()
        else:
            retry_config = config
        
        @wraps(f)
        def wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(retry_config.max_retries + 1):
                try:
                    return f(*args, **kwargs)
                except retry_config.retry_exceptions as e:
                    last_exception = e
                    
                    # Check if should retry
                    if attempt >= retry_config.max_retries:
                        break
                    
                    # Calculate delay with exponential backoff and jitter
                    delay = min(
                        retry_config.base_delay * (retry_config.exponential_base ** attempt),
                        retry_config.max_delay
                    )
                    jitter = random.uniform(0, retry_config.jitter_range)
                    total_delay = delay + jitter
                    
                    # Log retry
                    logger = logging.getLogger(__name__)
                    logger.warning(
                        f"Retry {attempt + 1}/{retry_config.max_retries} for {f.__name__} "
                        f"after {total_delay:.2f}s: {e}"
                    )
                    
                    # Notify tracker
                    if tracker:
                        tracker.on_retry(attempt + 1, retry_config.max_retries, total_delay, e)
                    
                    time.sleep(total_delay)
                
                except HTTPError as e:
                    if REQUESTS_AVAILABLE and hasattr(e, 'response'):
                        # Check if status code should trigger retry
                        if e.response.status_code in retry_config.retry_status_codes:
                            last_exception = e
                            if attempt >= retry_config.max_retries:
                                break
                            
                            delay = min(
                                retry_config.base_delay * (retry_config.exponential_base ** attempt),
                                retry_config.max_delay
                            )
                            jitter = random.uniform(0, retry_config.jitter_range)
                            total_delay = delay + jitter
                            
                            logger = logging.getLogger(__name__)
                            logger.warning(
                                f"Retry {attempt + 1}/{retry_config.max_retries} for {f.__name__} "
                                f"(HTTP {e.response.status_code}) after {total_delay:.2f}s"
                            )
                            
                            if tracker:
                                tracker.on_retry(attempt + 1, retry_config.max_retries, total_delay, e)
                            
                            time.sleep(total_delay)
                        else:
                            # Don't retry for other HTTP errors
                            raise
                    else:
                        raise
            
            # All retries exhausted
            if last_exception:
                raise last_exception
            raise RuntimeError("Retry logic error")
        
        return wrapper
    
    # Support both @exponential_backoff and @exponential_backoff(...) syntax
    if func is None:
        # Called with arguments: @exponential_backoff(config=..., tracker=...)
        return decorator
    else:
        # Called without arguments: @exponential_backoff
        return decorator(func)


class NetworkState:
    """Detect and monitor network state.
    
    Implements Step 6.4.3.1 - Network Connectivity Detection.
    """
    
    _is_online: Optional[bool] = None
    _last_check: Optional[float] = None
    _check_interval = 30.0  # Check every 30 seconds
    
    @staticmethod
    def is_online(force_check: bool = False) -> bool:
        """Check if network is available.
        
        Args:
            force_check: Force new check (ignore cache)
            
        Returns:
            True if network is available
        """
        # Use cached result if recent
        if not force_check and NetworkState._is_online is not None:
            if NetworkState._last_check is not None:
                if time.time() - NetworkState._last_check < NetworkState._check_interval:
                    return NetworkState._is_online
        
        # Perform check
        try:
            # Try to connect to a reliable host (Google DNS)
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            NetworkState._is_online = True
        except OSError:
            NetworkState._is_online = False
        
        NetworkState._last_check = time.time()
        return NetworkState._is_online
    
    @staticmethod
    def check_specific_host(host: str, port: int = 80, timeout: float = 3.0) -> bool:
        """Check connectivity to specific host.
        
        Args:
            host: Hostname to check
            port: Port to check
            timeout: Timeout in seconds
            
        Returns:
            True if host is reachable
        """
        try:
            socket.create_connection((host, port), timeout=timeout)
            return True
        except OSError:
            return False


if REQUESTS_AVAILABLE:
    class TimeoutHTTPAdapter(HTTPAdapter):
        """HTTP adapter with configurable timeouts.
        
        Implements Step 6.4.1.2 - Timeout Implementation.
        """
        
        def __init__(self, timeout_config: TimeoutConfig, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.timeout_config = timeout_config
        
        def send(self, request, **kwargs):
            # Set timeout tuple: (connect, read)
            timeout = (
                self.timeout_config.connect,
                self.timeout_config.read
            )
            kwargs['timeout'] = timeout
            return super().send(request, **kwargs)
    
    def create_session(timeout_config: Optional[TimeoutConfig] = None) -> requests.Session:
        """Create requests session with timeout configuration.
        
        Args:
            timeout_config: Timeout configuration (default: standard)
            
        Returns:
            Configured requests.Session
        """
        if timeout_config is None:
            timeout_config = NetworkConfig.get_timeout()
        
        session = requests.Session()
        adapter = TimeoutHTTPAdapter(timeout_config)
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        
        return session
