"""Unit tests for metrics collection utility."""

import json
import tempfile
from pathlib import Path
from unittest.mock import Mock

import pytest

from cuepoint.utils.metrics import (
    ApplicationMetrics,
    ErrorMetrics,
    InstallationMetrics,
    MetricsCollector,
    ProcessingMetrics,
    UpdateMetrics,
)


class TestInstallationMetrics:
    """Test installation metrics."""

    def test_initialization(self):
        """Test metrics initialization."""
        metrics = InstallationMetrics()
        assert metrics.total_attempts == 0
        assert metrics.successful_installs == 0
        assert metrics.failed_installs == 0

    def test_calculate_success_rate(self):
        """Test success rate calculation."""
        metrics = InstallationMetrics()
        metrics.total_attempts = 10
        metrics.successful_installs = 9
        metrics.failed_installs = 1

        assert metrics.calculate_success_rate() == 90.0

    def test_calculate_success_rate_zero(self):
        """Test success rate with zero attempts."""
        metrics = InstallationMetrics()
        assert metrics.calculate_success_rate() == 0.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        metrics = InstallationMetrics()
        metrics.total_attempts = 5
        metrics.successful_installs = 4

        data = metrics.to_dict()
        assert data["total_attempts"] == 5
        assert data["successful_installs"] == 4
        assert "success_rate" in data


class TestProcessingMetrics:
    """Test processing metrics."""

    def test_initialization(self):
        """Test metrics initialization."""
        metrics = ProcessingMetrics()
        assert metrics.total_tracks_processed == 0
        assert metrics.successful_matches == 0

    def test_add_processing_time(self):
        """Test adding processing time."""
        metrics = ProcessingMetrics()
        metrics.add_processing_time(1.5)
        metrics.add_processing_time(2.5)

        assert len(metrics.processing_times) == 2
        assert metrics.average_processing_time == 2.0

    def test_calculate_success_rate(self):
        """Test success rate calculation."""
        metrics = ProcessingMetrics()
        metrics.total_tracks_processed = 100
        metrics.successful_matches = 98

        assert metrics.calculate_success_rate() == 98.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        metrics = ProcessingMetrics()
        metrics.total_tracks_processed = 10
        metrics.successful_matches = 9

        data = metrics.to_dict()
        assert data["total_tracks_processed"] == 10
        assert data["successful_matches"] == 9
        assert "success_rate" in data


class TestErrorMetrics:
    """Test error metrics."""

    def test_initialization(self):
        """Test metrics initialization."""
        metrics = ErrorMetrics()
        assert metrics.total_errors == 0
        assert metrics.recovered_errors == 0

    def test_calculate_recovery_rate(self):
        """Test recovery rate calculation."""
        metrics = ErrorMetrics()
        metrics.total_errors = 10
        metrics.recovered_errors = 9

        assert metrics.calculate_recovery_rate() == 90.0

    def test_error_types_tracking(self):
        """Test error type tracking."""
        metrics = ErrorMetrics()
        metrics.error_types["NetworkError"] += 1
        metrics.error_types["FileError"] += 2

        assert metrics.error_types["NetworkError"] == 1
        assert metrics.error_types["FileError"] == 2

    def test_to_dict(self):
        """Test conversion to dictionary."""
        metrics = ErrorMetrics()
        metrics.total_errors = 5
        metrics.recovered_errors = 4

        data = metrics.to_dict()
        assert data["total_errors"] == 5
        assert data["recovered_errors"] == 4
        assert "recovery_rate" in data


class TestUpdateMetrics:
    """Test update metrics."""

    def test_initialization(self):
        """Test metrics initialization."""
        metrics = UpdateMetrics()
        assert metrics.total_update_checks == 0
        assert metrics.updates_available == 0

    def test_calculate_adoption_rate(self):
        """Test adoption rate calculation."""
        metrics = UpdateMetrics()
        metrics.updates_available = 10
        metrics.updates_installed = 8

        assert metrics.calculate_adoption_rate() == 80.0

    def test_calculate_adoption_rate_zero(self):
        """Test adoption rate with zero updates."""
        metrics = UpdateMetrics()
        assert metrics.calculate_adoption_rate() == 0.0

    def test_to_dict(self):
        """Test conversion to dictionary."""
        metrics = UpdateMetrics()
        metrics.updates_available = 5
        metrics.updates_installed = 4

        data = metrics.to_dict()
        assert data["updates_available"] == 5
        assert data["updates_installed"] == 4
        assert "adoption_rate" in data


class TestMetricsCollector:
    """Test metrics collector."""

    def test_initialization(self):
        """Test collector initialization."""
        collector = MetricsCollector(enabled=True)
        assert collector.enabled is True
        assert collector.metrics is not None

    def test_initialization_disabled(self):
        """Test collector initialization when disabled."""
        collector = MetricsCollector(enabled=False)
        assert collector.enabled is False

    def test_record_installation_attempt_success(self):
        """Test recording successful installation."""
        collector = MetricsCollector(enabled=True)
        collector.record_installation_attempt(success=True)

        assert collector.metrics.installation.total_attempts == 1
        assert collector.metrics.installation.successful_installs == 1
        assert collector.metrics.installation.failed_installs == 0

    def test_record_installation_attempt_failure(self):
        """Test recording failed installation."""
        collector = MetricsCollector(enabled=True)
        collector.record_installation_attempt(success=False)

        assert collector.metrics.installation.total_attempts == 1
        assert collector.metrics.installation.successful_installs == 0
        assert collector.metrics.installation.failed_installs == 1

    def test_record_processing(self):
        """Test recording processing metrics."""
        collector = MetricsCollector(enabled=True)
        collector.record_processing(tracks_processed=10, matches_found=9, processing_time=5.0)

        assert collector.metrics.processing.total_tracks_processed == 10
        assert collector.metrics.processing.successful_matches == 9
        assert collector.metrics.processing.failed_matches == 1
        assert len(collector.metrics.processing.processing_times) == 1

    def test_record_error(self):
        """Test recording error."""
        collector = MetricsCollector(enabled=True)
        collector.record_error("NetworkError", recovered=True)

        assert collector.metrics.errors.total_errors == 1
        assert collector.metrics.errors.recovered_errors == 1
        assert collector.metrics.errors.error_types["NetworkError"] == 1

    def test_record_error_unrecovered(self):
        """Test recording unrecovered error."""
        collector = MetricsCollector(enabled=True)
        collector.record_error("FileError", recovered=False)

        assert collector.metrics.errors.total_errors == 1
        assert collector.metrics.errors.unrecovered_errors == 1

    def test_record_update_check(self):
        """Test recording update check."""
        collector = MetricsCollector(enabled=True)
        collector.record_update_check(update_available=True)

        assert collector.metrics.updates.total_update_checks == 1
        assert collector.metrics.updates.updates_available == 1

    def test_record_update_action_install(self):
        """Test recording update installation."""
        collector = MetricsCollector(enabled=True)
        collector.record_update_action(installed=True)

        assert collector.metrics.updates.updates_installed == 1
        assert collector.metrics.updates.updates_skipped == 0

    def test_record_update_action_skip(self):
        """Test recording update skip."""
        collector = MetricsCollector(enabled=True)
        collector.record_update_action(installed=False)

        assert collector.metrics.updates.updates_installed == 0
        assert collector.metrics.updates.updates_skipped == 1

    def test_record_session_start(self):
        """Test recording session start."""
        collector = MetricsCollector(enabled=True)
        collector.record_session_start()

        assert collector.metrics.session_count == 1
        assert collector.metrics.first_launch_date is not None
        assert collector.metrics.last_launch_date is not None

    def test_get_metrics_summary(self):
        """Test getting metrics summary."""
        collector = MetricsCollector(enabled=True)
        collector.record_installation_attempt(success=True)
        collector.record_processing(tracks_processed=10, matches_found=9, processing_time=5.0)

        summary = collector.get_metrics_summary()
        assert "installation" in summary
        assert "processing" in summary
        assert "errors" in summary
        assert "updates" in summary

    def test_get_success_criteria_status(self):
        """Test getting success criteria status."""
        collector = MetricsCollector(enabled=True)
        
        # Set up metrics to meet targets
        collector.metrics.installation.total_attempts = 100
        collector.metrics.installation.successful_installs = 96  # 96% > 95%
        
        collector.metrics.processing.total_tracks_processed = 100
        collector.metrics.processing.successful_matches = 99  # 99% > 98%
        
        collector.metrics.errors.total_errors = 10
        collector.metrics.errors.recovered_errors = 9  # 90% >= 90%
        
        collector.metrics.updates.updates_available = 10
        collector.metrics.updates.updates_installed = 8  # 80% >= 80%

        status = collector.get_success_criteria_status()
        assert status["installation_success_rate"] >= 95.0
        assert status["processing_success_rate"] >= 98.0
        assert status["error_recovery_rate"] >= 90.0
        assert status["update_adoption_rate"] >= 80.0

    def test_save_and_load_metrics(self):
        """Test saving and loading metrics from file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            metrics_file = Path(tmpdir) / "metrics.json"
            
            # Create collector and record some metrics
            collector1 = MetricsCollector(metrics_file=metrics_file, enabled=True)
            collector1.record_installation_attempt(success=True)
            collector1.record_session_start()

            # Create new collector and load metrics
            collector2 = MetricsCollector(metrics_file=metrics_file, enabled=True)
            
            assert collector2.metrics.installation.total_attempts == 1
            assert collector2.metrics.installation.successful_installs == 1
            assert collector2.metrics.session_count == 1

    def test_clear_metrics(self):
        """Test clearing metrics."""
        collector = MetricsCollector(enabled=True)
        collector.record_installation_attempt(success=True)
        collector.record_session_start()

        collector.clear_metrics()

        assert collector.metrics.installation.total_attempts == 0
        assert collector.metrics.session_count == 0

    def test_export_metrics(self):
        """Test exporting metrics to file."""
        collector = MetricsCollector(enabled=True)
        collector.record_installation_attempt(success=True)

        with tempfile.TemporaryDirectory() as tmpdir:
            export_file = Path(tmpdir) / "export.json"
            collector.export_metrics(export_file)

            assert export_file.exists()
            with open(export_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                assert "installation" in data

    def test_disabled_collector(self):
        """Test that disabled collector doesn't record metrics."""
        collector = MetricsCollector(enabled=False)
        collector.record_installation_attempt(success=True)
        collector.record_processing(tracks_processed=10, matches_found=9, processing_time=5.0)

        assert collector.metrics.installation.total_attempts == 0
        assert collector.metrics.processing.total_tracks_processed == 0

    def test_thread_safety(self):
        """Test thread safety of metrics collection."""
        import threading

        collector = MetricsCollector(enabled=True)
        
        def record_installations():
            for _ in range(10):
                collector.record_installation_attempt(success=True)

        threads = [threading.Thread(target=record_installations) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        # Should have 50 total attempts (5 threads * 10 each)
        assert collector.metrics.installation.total_attempts == 50
        assert collector.metrics.installation.successful_installs == 50

    def test_logging_service_integration(self):
        """Test integration with logging service."""
        logging_service = Mock()
        collector = MetricsCollector(
            logging_service=logging_service, enabled=True
        )
        collector.record_installation_attempt(success=True)

        # Verify logging was called
        assert logging_service.info.called
