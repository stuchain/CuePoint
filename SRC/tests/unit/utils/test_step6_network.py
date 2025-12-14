#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.4: Networking Reliability

Tests TimeoutConfig, NetworkConfig, RetryConfig, exponential_backoff, NetworkState.
"""

import socket
import time
from unittest.mock import Mock, patch

import pytest

from cuepoint.utils.network import (
    NetworkConfig,
    NetworkState,
    RetryConfig,
    RetryTracker,
    TimeoutConfig,
    exponential_backoff,
)


class TestTimeoutConfig:
    """Test TimeoutConfig class."""

    def test_default_timeout(self):
        """Test default timeout config."""
        config = TimeoutConfig()
        assert config.connect == 5.0
        assert config.read == 30.0
        assert config.total == 60.0

    def test_for_search(self):
        """Test search timeout config."""
        config = TimeoutConfig.for_search()
        assert config.connect == 5.0
        assert config.read == 45.0
        assert config.total == 90.0

    def test_for_quick_check(self):
        """Test quick check timeout config."""
        config = TimeoutConfig.for_quick_check()
        assert config.connect == 5.0
        assert config.read == 10.0
        assert config.total == 20.0

    def test_for_download(self):
        """Test download timeout config."""
        config = TimeoutConfig.for_download()
        assert config.connect == 5.0
        assert config.read == 60.0
        assert config.total == 300.0


class TestNetworkConfig:
    """Test NetworkConfig class."""

    def test_get_timeout_default(self):
        """Test getting default timeout."""
        config = NetworkConfig.get_timeout()
        assert isinstance(config, TimeoutConfig)

    def test_get_timeout_search(self):
        """Test getting search timeout."""
        config = NetworkConfig.get_timeout("search")
        assert config.read == 45.0

    def test_get_timeout_quick(self):
        """Test getting quick timeout."""
        config = NetworkConfig.get_timeout("quick")
        assert config.read == 10.0

    def test_get_timeout_download(self):
        """Test getting download timeout."""
        config = NetworkConfig.get_timeout("download")
        assert config.read == 60.0


class TestRetryConfig:
    """Test RetryConfig class."""

    def test_default_config(self):
        """Test default retry config."""
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.base_delay == 0.5
        assert config.max_delay == 10.0
        assert config.jitter_range == 0.25
        assert config.exponential_base == 2.0


class TestExponentialBackoff:
    """Test exponential_backoff decorator."""

    def test_success_no_retry(self):
        """Test successful call with no retry needed."""
        @exponential_backoff
        def test_func():
            return "success"
        
        result = test_func()
        assert result == "success"

    def test_retry_succeeds(self):
        """Test retry that eventually succeeds."""
        call_count = [0]
        
        # Use a config that includes Exception for testing
        config = RetryConfig()
        config.retry_exceptions = (Exception,)  # Catch all exceptions for test
        
        @exponential_backoff(config=config)
        def test_func():
            call_count[0] += 1
            if call_count[0] < 2:
                raise Exception("Test error")
            return "success"
        
        result = test_func()
        assert result == "success"
        assert call_count[0] == 2

    def test_retry_exhausted(self):
        """Test retry that exhausts all attempts."""
        @exponential_backoff
        def test_func():
            raise ConnectionError("Test error")
        
        with pytest.raises(ConnectionError):
            test_func()

    def test_retry_with_tracker(self):
        """Test retry with tracker."""
        tracker = RetryTracker()
        call_count = [0]
        
        # Use a config that includes Exception for testing
        config = RetryConfig()
        config.retry_exceptions = (Exception,)  # Catch all exceptions for test
        
        @exponential_backoff(config=config, tracker=tracker)
        def test_func():
            call_count[0] += 1
            if call_count[0] < 2:
                raise Exception("Test error")
            return "success"
        
        result = test_func()
        assert result == "success"
        assert tracker.attempts == 1


class TestNetworkState:
    """Test NetworkState class."""

    @patch('socket.create_connection')
    def test_is_online_success(self, mock_connect):
        """Test network online detection."""
        mock_connect.return_value = True
        NetworkState._is_online = None
        NetworkState._last_check = None
        
        result = NetworkState.is_online(force_check=True)
        assert result is True
        assert NetworkState._is_online is True

    @patch('socket.create_connection')
    def test_is_online_failure(self, mock_connect):
        """Test network offline detection."""
        mock_connect.side_effect = OSError("Connection failed")
        NetworkState._is_online = None
        NetworkState._last_check = None
        
        result = NetworkState.is_online(force_check=True)
        assert result is False
        assert NetworkState._is_online is False

    def test_is_online_cached(self):
        """Test cached network state."""
        NetworkState._is_online = True
        NetworkState._last_check = time.time()
        
        result = NetworkState.is_online(force_check=False)
        assert result is True

    @patch('socket.create_connection')
    def test_check_specific_host_success(self, mock_connect):
        """Test checking specific host."""
        mock_connect.return_value = True
        
        result = NetworkState.check_specific_host("example.com", 80)
        assert result is True

    @patch('socket.create_connection')
    def test_check_specific_host_failure(self, mock_connect):
        """Test checking specific host failure."""
        mock_connect.side_effect = OSError("Connection failed")
        
        result = NetworkState.check_specific_host("example.com", 80)
        assert result is False


class TestRetryTracker:
    """Test RetryTracker class."""

    def test_tracker_initialization(self):
        """Test tracker initialization."""
        tracker = RetryTracker()
        assert tracker.attempts == 0
        assert tracker.total_delay == 0.0

    def test_tracker_on_retry(self):
        """Test tracker on retry."""
        callback = Mock()
        tracker = RetryTracker(callback=callback)
        
        error = ConnectionError("Test")
        tracker.on_retry(1, 3, 0.5, error)
        
        assert tracker.attempts == 1
        assert tracker.total_delay == 0.5
        callback.on_retry.assert_called_once_with(1, 3, 0.5, error)
