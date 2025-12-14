#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
File Safety and Backup System

Implements Step 6.7 - Backups and Safety with:
- Atomic write operations
- Backup mechanisms
- Overwrite protection
- Data integrity verification
"""

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple, Union

from cuepoint.utils.paths import AppPaths, StorageInvariants

logger = logging.getLogger(__name__)


class SafeFileWriter:
    """Safe file writing with atomic operations.
    
    Implements Step 6.7.1.1 - Atomic Write Pattern.
    """
    
    @staticmethod
    def write_atomic(
        file_path: Path,
        content: Union[bytes, str],
        mode: str = 'wb',
        backup: bool = False
    ) -> bool:
        """Write file atomically.
        
        Args:
            file_path: Target file path.
            content: Content to write (bytes or string).
            mode: Write mode ('wb' for bytes, 'w' for text).
            backup: Create backup of existing file.
            
        Returns:
            True if write succeeded.
            
        Raises:
            OSError: If write fails.
        """
        # Validate write location
        is_safe, error = StorageInvariants.validate_write_location(file_path)
        if not is_safe:
            raise OSError(f"Cannot write to restricted location: {error}")
        
        # Convert string to bytes if needed
        if isinstance(content, str) and mode == 'wb':
            content = content.encode('utf-8')
        elif isinstance(content, bytes) and mode == 'w':
            mode = 'wb'
        
        # Create backup if requested and file exists
        backup_path = None
        if backup and file_path.exists():
            backup_path = file_path.with_suffix(file_path.suffix + '.bak')
            try:
                shutil.copy2(file_path, backup_path)
            except Exception as e:
                logger.warning(f"Failed to create backup: {e}")
        
        # Write to temporary file
        temp_path = file_path.with_suffix(file_path.suffix + '.tmp')
        
        try:
            # Ensure parent directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write content
            with open(temp_path, mode) as f:
                if mode == 'wb':
                    f.write(content)
                else:
                    f.write(content)
                f.flush()
                os.fsync(f.fileno())  # Ensure written to disk (Step 6.7.1.2)
            
            # Verify write (Step 6.7.1.3)
            if not temp_path.exists() or temp_path.stat().st_size == 0:
                raise IOError("Temporary file write verification failed")
            
            if isinstance(content, bytes):
                expected_size = len(content)
                actual_size = temp_path.stat().st_size
                if actual_size != expected_size:
                    raise IOError(f"Size mismatch: expected {expected_size}, got {actual_size}")
            
            # Atomic rename
            temp_path.replace(file_path)
            
            logger.debug(f"Atomic write succeeded: {file_path}")
            return True
            
        except Exception as e:
            # Clean up temp file on error
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            
            # Restore backup if write failed
            if backup_path and backup_path.exists():
                try:
                    shutil.copy2(backup_path, file_path)
                    logger.info(f"Restored backup after failed write: {file_path}")
                except Exception:
                    pass
            
            logger.error(f"Atomic write failed for {file_path}: {e}")
            raise
    
    @staticmethod
    def write_text_atomic(
        file_path: Path,
        text: str,
        encoding: str = 'utf-8',
        backup: bool = False
    ) -> bool:
        """Write text file atomically.
        
        Args:
            file_path: Target file path.
            text: Text content.
            encoding: Text encoding.
            backup: Create backup.
            
        Returns:
            True if write succeeded.
        """
        content = text.encode(encoding)
        return SafeFileWriter.write_atomic(file_path, content, 'wb', backup)


class WriteVerifier:
    """Verify file writes.
    
    Implements Step 6.7.1.3 - Write Verification.
    """
    
    @staticmethod
    def verify_write(file_path: Path, expected_size: Optional[int] = None) -> bool:
        """Verify file write succeeded.
        
        Args:
            file_path: File to verify.
            expected_size: Expected file size (optional).
            
        Returns:
            True if write verified.
        """
        if not file_path.exists():
            return False
        
        if expected_size is not None:
            actual_size = file_path.stat().st_size
            if actual_size != expected_size:
                return False
        
        # Try to read file
        try:
            with open(file_path, 'rb') as f:
                f.read(1)  # Try to read at least one byte
            return True
        except Exception:
            return False
    
    @staticmethod
    def verify_content(file_path: Path, expected_content: bytes) -> bool:
        """Verify file content matches expected.
        
        Args:
            file_path: File to verify.
            expected_content: Expected content.
            
        Returns:
            True if content matches.
        """
        try:
            with open(file_path, 'rb') as f:
                actual_content = f.read()
            return actual_content == expected_content
        except Exception:
            return False


class BackupManager:
    """Manage file backups.
    
    Implements Step 6.7.2 - Backup Mechanisms.
    """
    
    @staticmethod
    def create_backup(
        file_path: Path,
        backup_dir: Optional[Path] = None,
        max_backups: int = 5
    ) -> Path:
        """Create backup of file.
        
        Args:
            file_path: File to backup.
            backup_dir: Backup directory (default: same as file).
            max_backups: Maximum number of backups to keep.
            
        Returns:
            Path to backup file.
        """
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if backup_dir is None:
            backup_dir = file_path.parent
        
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Create timestamped backup
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_name = f"{file_path.stem}-{timestamp}{file_path.suffix}.bak"
        backup_path = backup_dir / backup_name
        
        # Copy file
        shutil.copy2(file_path, backup_path)
        
        # Clean up old backups
        BackupManager._cleanup_old_backups(file_path, backup_dir, max_backups)
        
        logger.info(f"Created backup: {backup_path}")
        return backup_path
    
    @staticmethod
    def _cleanup_old_backups(
        file_path: Path,
        backup_dir: Path,
        max_backups: int
    ):
        """Remove old backups beyond limit.
        
        Args:
            file_path: Original file.
            backup_dir: Backup directory.
            max_backups: Maximum backups to keep.
        """
        # Find all backups for this file
        pattern = f"{file_path.stem}-*.bak"
        backups = sorted(backup_dir.glob(pattern), key=lambda p: p.stat().st_mtime)
        
        # Remove oldest if over limit
        while len(backups) > max_backups:
            oldest = backups.pop(0)
            try:
                oldest.unlink()
                logger.debug(f"Removed old backup: {oldest}")
            except Exception as e:
                logger.warning(f"Failed to remove old backup {oldest}: {e}")
    
    @staticmethod
    def list_backups(file_path: Path, backup_dir: Optional[Path] = None) -> List[Path]:
        """List available backups for file.
        
        Args:
            file_path: Original file.
            backup_dir: Backup directory.
            
        Returns:
            List of backup file paths (newest first).
        """
        if backup_dir is None:
            backup_dir = file_path.parent
        
        pattern = f"{file_path.stem}-*.bak"
        backups = sorted(
            backup_dir.glob(pattern),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        
        return backups
    
    @staticmethod
    def restore_backup(backup_path: Path, target_path: Path, create_backup: bool = True) -> bool:
        """Restore file from backup.
        
        Args:
            backup_path: Path to backup file.
            target_path: Path to restore to.
            create_backup: Create backup of current file before restoring.
            
        Returns:
            True if restore succeeded.
        """
        if not backup_path.exists():
            raise FileNotFoundError(f"Backup not found: {backup_path}")
        
        try:
            # Create backup of current file if it exists and requested
            if create_backup and target_path.exists():
                BackupManager.create_backup(target_path, max_backups=1)
            
            # Restore from backup using atomic write
            content = backup_path.read_bytes()
            SafeFileWriter.write_atomic(target_path, content, mode='wb', backup=False)
            
            logger.info(f"Restored file from backup: {target_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to restore backup: {e}")
            raise


class OverwriteProtection:
    """Protect against accidental overwrites.
    
    Implements Step 6.7.2.2 - Overwrite Protection.
    """
    
    @staticmethod
    def check_overwrite(file_path: Path) -> Tuple[bool, Optional[str]]:
        """Check if file exists and would be overwritten.
        
        Args:
            file_path: File path to check.
            
        Returns:
            Tuple of (would_overwrite, message).
        """
        if not file_path.exists():
            return False, None
        
        stat = file_path.stat()
        size_mb = stat.st_size / (1024 * 1024)
        modified = datetime.fromtimestamp(stat.st_mtime)
        
        message = (
            f"File already exists:\n{file_path}\n\n"
            f"Size: {size_mb:.2f} MB\n"
            f"Modified: {modified.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            f"Overwriting will replace the existing file."
        )
        
        return True, message
    
    @staticmethod
    def safe_overwrite(
        file_path: Path,
        content: Union[bytes, str],
        create_backup: bool = True,
        mode: str = 'wb'
    ) -> bool:
        """Safely overwrite file with backup.
        
        Args:
            file_path: File to overwrite.
            content: Content to write.
            create_backup: Create backup before overwrite.
            mode: Write mode.
            
        Returns:
            True if overwrite succeeded.
        """
        # Create backup if requested
        if create_backup and file_path.exists():
            BackupManager.create_backup(file_path)
        
        # Write atomically
        return SafeFileWriter.write_atomic(file_path, content, mode, backup=False)
