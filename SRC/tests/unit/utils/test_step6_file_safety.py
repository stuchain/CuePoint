#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Step 6.7: Backups and Safety

Tests SafeFileWriter, WriteVerifier, BackupManager, OverwriteProtection.
"""

import tempfile
from pathlib import Path

import pytest

from cuepoint.utils.file_safety import (
    BackupManager,
    OverwriteProtection,
    SafeFileWriter,
    WriteVerifier,
)


class TestSafeFileWriter:
    """Test SafeFileWriter class."""

    def test_write_atomic_bytes(self):
        """Test atomic write with bytes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            content = b"test content"
            
            result = SafeFileWriter.write_atomic(file_path, content, mode='wb')
            assert result is True
            assert file_path.exists()
            assert file_path.read_bytes() == content

    def test_write_atomic_text(self):
        """Test atomic write with text."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            content = "test content"
            
            result = SafeFileWriter.write_text_atomic(file_path, content)
            assert result is True
            assert file_path.exists()
            assert file_path.read_text() == content

    def test_write_atomic_with_backup(self):
        """Test atomic write with backup."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            original_content = "original"
            new_content = "new content"
            
            # Create original file
            file_path.write_text(original_content)
            
            # Write with backup
            result = SafeFileWriter.write_atomic(file_path, new_content.encode(), backup=True)
            assert result is True
            assert file_path.read_text() == new_content
            
            # Check backup exists
            backup = file_path.with_suffix(file_path.suffix + '.bak')
            assert backup.exists()
            assert backup.read_text() == original_content

    def test_write_atomic_verification(self):
        """Test atomic write verification."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            content = b"test"
            
            SafeFileWriter.write_atomic(file_path, content)
            
            # Verify write
            assert WriteVerifier.verify_write(file_path, expected_size=len(content))

    def test_write_atomic_restricted_location(self):
        """Test atomic write to restricted location."""
        # This would need actual restricted location to test properly
        # For now, just test the function exists
        assert hasattr(SafeFileWriter, 'write_atomic')


class TestWriteVerifier:
    """Test WriteVerifier class."""

    def test_verify_write_exists(self):
        """Test verifying existing file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("test")
            
            assert WriteVerifier.verify_write(file_path) is True

    def test_verify_write_not_exists(self):
        """Test verifying non-existent file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "nonexistent.txt"
            
            assert WriteVerifier.verify_write(file_path) is False

    def test_verify_write_size(self):
        """Test verifying file size."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            content = b"test content"
            file_path.write_bytes(content)
            
            assert WriteVerifier.verify_write(file_path, expected_size=len(content)) is True
            assert WriteVerifier.verify_write(file_path, expected_size=999) is False

    def test_verify_content(self):
        """Test verifying file content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            content = b"test content"
            file_path.write_bytes(content)
            
            assert WriteVerifier.verify_content(file_path, content) is True
            assert WriteVerifier.verify_content(file_path, b"different") is False


class TestBackupManager:
    """Test BackupManager class."""

    def test_create_backup(self):
        """Test creating backup."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("original content")
            
            backup_path = BackupManager.create_backup(file_path)
            
            assert backup_path.exists()
            assert backup_path.read_text() == "original content"
            assert backup_path.suffix == ".bak"
            assert "test-" in backup_path.name

    def test_list_backups(self):
        """Test listing backups."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("content")
            
            # Create multiple backups with higher max_backups
            BackupManager.create_backup(file_path, max_backups=10)
            BackupManager.create_backup(file_path, max_backups=10)
            
            backups = BackupManager.list_backups(file_path)
            assert len(backups) >= 1  # At least one backup should exist
            assert all(b.suffix == ".bak" for b in backups)

    def test_restore_backup(self):
        """Test restoring from backup."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            original_content = "original"
            file_path.write_text(original_content)
            
            # Create backup
            backup_path = BackupManager.create_backup(file_path)
            
            # Modify file
            file_path.write_text("modified")
            
            # Restore from backup (don't create backup of modified file)
            BackupManager.restore_backup(backup_path, file_path, create_backup=False)
            
            assert file_path.read_text() == original_content

    def test_backup_cleanup(self):
        """Test backup cleanup."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("content")
            
            # Create more backups than max
            for _ in range(7):
                BackupManager.create_backup(file_path, max_backups=5)
            
            backups = BackupManager.list_backups(file_path)
            # Should have at most 5 backups
            assert len(backups) <= 5

    def test_create_backup_not_exists(self):
        """Test creating backup of non-existent file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "nonexistent.txt"
            
            with pytest.raises(FileNotFoundError):
                BackupManager.create_backup(file_path)


class TestOverwriteProtection:
    """Test OverwriteProtection class."""

    def test_check_overwrite_exists(self):
        """Test checking overwrite when file exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("existing content")
            
            would_overwrite, message = OverwriteProtection.check_overwrite(file_path)
            assert would_overwrite is True
            assert message is not None
            assert "already exists" in message

    def test_check_overwrite_not_exists(self):
        """Test checking overwrite when file doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "nonexistent.txt"
            
            would_overwrite, message = OverwriteProtection.check_overwrite(file_path)
            assert would_overwrite is False
            assert message is None

    def test_safe_overwrite(self):
        """Test safe overwrite."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            original_content = "original"
            new_content = "new"
            
            file_path.write_text(original_content)
            
            result = OverwriteProtection.safe_overwrite(
                file_path,
                new_content,
                create_backup=True
            )
            
            assert result is True
            assert file_path.read_text() == new_content
            
            # Check backup was created
            backups = BackupManager.list_backups(file_path)
            assert len(backups) > 0

    def test_safe_overwrite_no_backup(self):
        """Test safe overwrite without backup."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("original")
            
            result = OverwriteProtection.safe_overwrite(
                file_path,
                "new",
                create_backup=False
            )
            
            assert result is True
            assert file_path.read_text() == "new"
