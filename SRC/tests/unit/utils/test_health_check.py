#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for health checks (Design 7)."""


from cuepoint.utils.health_check import (
    HealthCheckResult,
    check_parsing_service,
    check_search_service,
    run_all_health_checks,
)


class TestHealthCheck:
    def test_check_parsing_service(self):
        r = check_parsing_service()
        assert r.name == "parsing"
        assert r.ok is True
        assert "OK" in r.message

    def test_check_search_service_returns_result(self):
        r = check_search_service()
        assert r.name == "search"
        assert r.message in ("Online", "Offline", "Error")

    def test_run_all_health_checks(self):
        results = run_all_health_checks()
        assert "search" in results
        assert "parsing" in results
        assert "caching" in results
        for name, r in results.items():
            assert isinstance(r, HealthCheckResult)
            assert r.name == name
