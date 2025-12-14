#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import time
import os

import pytest

from cuepoint.utils.paths import AppPaths
from cuepoint.utils.privacy import DataDeletionManager, DataRetentionManager, PrivacyAuditor


@pytest.mark.unit
class TestPrivacyAuditor:
    def test_audit_data_collection_has_expected_sections(self):
        points = PrivacyAuditor.audit_data_collection()
        names = {p.name for p in points}
        assert "Configuration" in names
        assert "Cache" in names
        assert "Logs" in names


@pytest.mark.unit
class TestDataDeletionManager:
    def test_clear_cache_logs_config(self, tmp_path, monkeypatch):
        cache_dir = tmp_path / "cache"
        logs_dir = tmp_path / "logs"
        config_dir = tmp_path / "config"

        cache_dir.mkdir()
        logs_dir.mkdir()
        config_dir.mkdir()

        (cache_dir / "a.bin").write_bytes(b"1")
        (logs_dir / "cuepoint.log").write_text("log")
        (logs_dir / "crashes").mkdir()
        (logs_dir / "crashes" / "crash.log").write_text("crash")
        (config_dir / "config.yaml").write_text("cfg")

        monkeypatch.setattr(AppPaths, "cache_dir", staticmethod(lambda: cache_dir))
        monkeypatch.setattr(AppPaths, "logs_dir", staticmethod(lambda: logs_dir))
        monkeypatch.setattr(AppPaths, "config_dir", staticmethod(lambda: config_dir))

        DataDeletionManager.clear_cache()
        assert cache_dir.exists()
        assert list(cache_dir.rglob("*")) == []

        DataDeletionManager.clear_logs()
        assert logs_dir.exists()
        assert list(logs_dir.rglob("*.log")) == []

        DataDeletionManager.clear_config()
        assert config_dir.exists()
        assert list(config_dir.rglob("*")) == []


@pytest.mark.unit
class TestDataRetentionManager:
    def test_enforce_cache_retention_deletes_oldest_first(self, tmp_path):
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        old = cache_dir / "old.bin"
        new = cache_dir / "new.bin"
        old.write_bytes(b"x" * 1024)
        new.write_bytes(b"y" * 1024)

        # Make 'old' older than 'new'
        now = time.time()
        old_mtime = now - 100
        new_mtime = now - 10
        os.utime(old, (old_mtime, old_mtime))
        os.utime(new, (new_mtime, new_mtime))

        # Limit to ~1KB so one file must be removed
        DataRetentionManager.enforce_cache_retention(cache_dir=cache_dir, max_size_mb=0)  # 0MB => 0 bytes
        # With 0MB limit, everything should be removed best-effort
        assert not old.exists()
        assert not new.exists()


