#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Tests for Step 5.5: Type Hints & Documentation.

This module verifies that all public APIs have type hints and documentation.
"""

import inspect
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, get_type_hints

import pytest

# Import modules to check
from cuepoint.core import matcher, mix_parser, query_generator, text_processing
from cuepoint.data import beatport, rekordbox
from cuepoint.services import (
    beatport_service,
    cache_service,
    config_service,
    export_service,
    logging_service,
    matcher_service,
    processor_service,
)
from cuepoint.ui.controllers import (
    config_controller,
    export_controller,
    main_controller,
    results_controller,
)
from cuepoint.utils import di_container, errors, utils


class TestTypeHints:
    """Test that all public functions have type hints."""

    @pytest.mark.unit
    def test_processor_service_type_hints(self):
        """Test ProcessorService has type hints."""
        service = processor_service.ProcessorService.__init__
        hints = get_type_hints(service)
        assert "beatport_service" in hints
        assert "matcher_service" in hints
        assert "logging_service" in hints
        assert "config_service" in hints

        # Test process_track method
        method = processor_service.ProcessorService.process_track
        hints = get_type_hints(method)
        assert "idx" in hints
        assert "track" in hints
        assert "settings" in hints
        assert "return" in hints

    @pytest.mark.unit
    def test_beatport_service_type_hints(self):
        """Test BeatportService has type hints."""
        service = beatport_service.BeatportService.__init__
        hints = get_type_hints(service)
        assert "cache_service" in hints
        assert "logging_service" in hints

        # Test search_tracks method
        method = beatport_service.BeatportService.search_tracks
        hints = get_type_hints(method)
        assert "query" in hints
        assert "max_results" in hints
        assert "return" in hints
        assert hints["return"] == List[str]

    @pytest.mark.unit
    def test_cache_service_type_hints(self):
        """Test CacheService has type hints."""
        # Test get method
        method = cache_service.CacheService.get
        hints = get_type_hints(method)
        assert "key" in hints
        assert "return" in hints

        # Test set method
        method = cache_service.CacheService.set
        hints = get_type_hints(method)
        assert "key" in hints
        assert "value" in hints
        assert "ttl" in hints

    @pytest.mark.unit
    def test_matcher_service_type_hints(self):
        """Test MatcherService has type hints."""
        method = matcher_service.MatcherService.find_best_match
        hints = get_type_hints(method)
        assert "idx" in hints
        assert "track_title" in hints
        assert "track_artists_for_scoring" in hints
        assert "title_only_mode" in hints
        assert "queries" in hints
        assert "return" in hints
        # Verify return type is a Tuple
        assert "Tuple" in str(hints["return"])

    @pytest.mark.unit
    def test_core_functions_type_hints(self):
        """Test core functions have type hints."""
        # Test best_beatport_match
        func = matcher.best_beatport_match
        hints = get_type_hints(func)
        assert "idx" in hints
        assert "track_title" in hints
        assert "queries" in hints
        assert "return" in hints

        # Test make_search_queries
        func = query_generator.make_search_queries
        hints = get_type_hints(func)
        assert "return" in hints

        # Test normalize_text
        func = text_processing.normalize_text
        hints = get_type_hints(func)
        assert "s" in hints
        assert "return" in hints

    @pytest.mark.unit
    def test_data_functions_type_hints(self):
        """Test data functions have type hints."""
        # Test parse_rekordbox
        func = rekordbox.parse_rekordbox
        hints = get_type_hints(func)
        assert "xml_path" in hints
        assert "return" in hints
        assert "Tuple" in str(hints["return"])

        # Test is_track_url
        func = beatport.is_track_url
        hints = get_type_hints(func)
        assert "u" in hints
        assert "return" in hints
        assert hints["return"] == bool

    @pytest.mark.unit
    def test_controller_type_hints(self):
        """Test controllers have type hints."""
        # Test ResultsController
        method = results_controller.ResultsController.apply_filters
        hints = get_type_hints(method)
        assert "search_text" in hints
        assert "confidence" in hints
        assert "return" in hints

        # Test ExportController
        method = export_controller.ExportController.validate_export_options
        hints = get_type_hints(method)
        assert "options" in hints
        assert "return" in hints

        # Test ConfigController
        method = config_controller.ConfigController.get_preset_values
        hints = get_type_hints(method)
        assert "preset" in hints
        assert "return" in hints


class TestDocstrings:
    """Test that all public functions and classes have docstrings."""

    @pytest.mark.unit
    def test_processor_service_docstrings(self):
        """Test ProcessorService has docstrings."""
        # Test class docstring
        assert processor_service.ProcessorService.__doc__ is not None
        assert len(processor_service.ProcessorService.__doc__.strip()) > 0

        # Test __init__ docstring
        assert processor_service.ProcessorService.__init__.__doc__ is not None

        # Test process_track docstring
        assert processor_service.ProcessorService.process_track.__doc__ is not None
        doc = processor_service.ProcessorService.process_track.__doc__
        assert "Args:" in doc or "Parameters:" in doc
        assert "Returns:" in doc

    @pytest.mark.unit
    def test_beatport_service_docstrings(self):
        """Test BeatportService has docstrings."""
        assert beatport_service.BeatportService.__doc__ is not None
        assert beatport_service.BeatportService.__init__.__doc__ is not None
        assert beatport_service.BeatportService.search_tracks.__doc__ is not None
        assert beatport_service.BeatportService.fetch_track_data.__doc__ is not None

    @pytest.mark.unit
    def test_cache_service_docstrings(self):
        """Test CacheService has docstrings."""
        assert cache_service.CacheService.__doc__ is not None
        assert cache_service.CacheService.get.__doc__ is not None
        assert cache_service.CacheService.set.__doc__ is not None
        assert cache_service.CacheService.clear.__doc__ is not None

    @pytest.mark.unit
    def test_matcher_service_docstrings(self):
        """Test MatcherService has docstrings."""
        assert matcher_service.MatcherService.__doc__ is not None
        assert matcher_service.MatcherService.find_best_match.__doc__ is not None
        doc = matcher_service.MatcherService.find_best_match.__doc__
        assert "Args:" in doc
        assert "Returns:" in doc

    @pytest.mark.unit
    def test_core_functions_docstrings(self):
        """Test core functions have docstrings."""
        assert matcher.best_beatport_match.__doc__ is not None
        assert query_generator.make_search_queries.__doc__ is not None
        assert text_processing.normalize_text.__doc__ is not None
        assert mix_parser._parse_mix_flags.__doc__ is not None

    @pytest.mark.unit
    def test_data_functions_docstrings(self):
        """Test data functions have docstrings."""
        assert rekordbox.parse_rekordbox.__doc__ is not None
        assert rekordbox.RBTrack.__doc__ is not None
        assert beatport.is_track_url.__doc__ is not None
        assert beatport.parse_track_page.__doc__ is not None

    @pytest.mark.unit
    def test_controller_docstrings(self):
        """Test controllers have docstrings."""
        assert results_controller.ResultsController.__doc__ is not None
        assert export_controller.ExportController.__doc__ is not None
        assert config_controller.ConfigController.__doc__ is not None
        assert main_controller.GUIController.__doc__ is not None
        assert main_controller.ProcessingWorker.__doc__ is not None

    @pytest.mark.unit
    def test_module_docstrings(self):
        """Test modules have module-level docstrings."""
        assert processor_service.__doc__ is not None
        assert beatport_service.__doc__ is not None
        assert cache_service.__doc__ is not None
        assert matcher.__doc__ is not None
        assert rekordbox.__doc__ is not None


class TestDocumentationQuality:
    """Test documentation quality and completeness."""

    @pytest.mark.unit
    def test_docstrings_have_args_section(self):
        """Test that complex functions have Args section."""
        # Check ProcessorService.process_track
        doc = processor_service.ProcessorService.process_track.__doc__
        assert "Args:" in doc or "Parameters:" in doc

        # Check MatcherService.find_best_match
        doc = matcher_service.MatcherService.find_best_match.__doc__
        assert "Args:" in doc

        # Check best_beatport_match
        doc = matcher.best_beatport_match.__doc__
        assert "Args:" in doc

    @pytest.mark.unit
    def test_docstrings_have_returns_section(self):
        """Test that functions with return values have Returns section."""
        # Check ProcessorService.process_track
        doc = processor_service.ProcessorService.process_track.__doc__
        assert "Returns:" in doc

        # Check BeatportService.search_tracks
        doc = beatport_service.BeatportService.search_tracks.__doc__
        assert "Returns:" in doc

        # Check MatcherService.find_best_match
        doc = matcher_service.MatcherService.find_best_match.__doc__
        assert "Returns:" in doc

    @pytest.mark.unit
    def test_docstrings_have_examples(self):
        """Test that complex functions have examples."""
        # Check ProcessorService.process_track
        doc = processor_service.ProcessorService.process_track.__doc__
        assert "Example:" in doc or "Examples:" in doc

        # Check BeatportService.search_tracks
        doc = beatport_service.BeatportService.search_tracks.__doc__
        assert "Example:" in doc or "Examples:" in doc

    @pytest.mark.unit
    def test_class_docstrings_have_attributes(self):
        """Test that classes document their attributes."""
        # Check ProcessorService
        doc = processor_service.ProcessorService.__doc__
        assert "Attributes:" in doc or "beatport_service" in doc.lower()

        # Check BeatportService
        doc = beatport_service.BeatportService.__doc__
        assert "Attributes:" in doc or "cache_service" in doc.lower()


class TestTypeChecking:
    """Test that mypy can type-check the code."""

    @pytest.mark.unit
    def test_mypy_imports(self):
        """Test that all modules can be imported with type checking."""
        # This test verifies that imports work correctly
        # If there are circular import issues, this will fail
        from cuepoint.services.processor_service import ProcessorService
        from cuepoint.services.beatport_service import BeatportService
        from cuepoint.services.cache_service import CacheService
        from cuepoint.core.matcher import best_beatport_match
        from cuepoint.data.rekordbox import parse_rekordbox, RBTrack

        # Verify types are accessible
        assert ProcessorService is not None
        assert BeatportService is not None
        assert CacheService is not None
        assert callable(best_beatport_match)
        assert callable(parse_rekordbox)

    @pytest.mark.unit
    def test_type_hints_are_valid(self):
        """Test that type hints can be resolved."""
        # Test that we can get type hints without errors
        hints = get_type_hints(processor_service.ProcessorService.process_track)
        assert isinstance(hints, dict)
        assert "return" in hints

        hints = get_type_hints(beatport_service.BeatportService.search_tracks)
        assert isinstance(hints, dict)
        assert hints["return"] == List[str]

        hints = get_type_hints(cache_service.CacheService.get)
        assert isinstance(hints, dict)
        assert "Optional" in str(hints["return"]) or "Any" in str(hints["return"])


class TestInterfaceDocumentation:
    """Test that interfaces are properly documented."""

    @pytest.mark.unit
    def test_interface_docstrings(self):
        """Test that service interfaces have docstrings."""
        from cuepoint.services.interfaces import (
            IBeatportService,
            ICacheService,
            IConfigService,
            IExportService,
            ILoggingService,
            IMatcherService,
            IProcessorService,
        )

        assert IProcessorService.__doc__ is not None
        assert IBeatportService.__doc__ is not None
        assert ICacheService.__doc__ is not None
        assert IMatcherService.__doc__ is not None

    @pytest.mark.unit
    def test_interface_methods_documented(self):
        """Test that interface methods have docstrings."""
        from cuepoint.services.interfaces import IProcessorService, IBeatportService

        assert IProcessorService.process_track.__doc__ is not None
        assert IBeatportService.search_tracks.__doc__ is not None
        assert IBeatportService.fetch_track_data.__doc__ is not None

