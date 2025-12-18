#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update downloader implementation.

Handles downloading update installers/DMGs with progress tracking.
"""

import os
import sys
import tempfile
from pathlib import Path
from typing import Callable, Optional

try:
    from PySide6.QtCore import QObject, Signal, QUrl
    from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    QObject = object
    Signal = None
    QNetworkRequest = None


class UpdateDownloader(QObject if QT_AVAILABLE else object):
    """
    Downloads update files with progress tracking.
    
    Uses QNetworkAccessManager for downloads with progress signals.
    """
    
    if QT_AVAILABLE:
        # Signals for download progress
        progress = Signal(int, int)  # bytes_received, bytes_total
        download_speed = Signal(float)  # MB/s
        time_remaining = Signal(int)  # seconds
        finished = Signal(str)  # file_path
        error = Signal(str)  # error_message
        cancelled = Signal()
    
    def __init__(self, parent=None):
        """Initialize downloader."""
        if QT_AVAILABLE:
            super().__init__(parent)
            self.network_manager = QNetworkAccessManager(self)
            self.current_reply: Optional[QNetworkReply] = None
            self.download_path: Optional[Path] = None
            self.download_file = None
            self.cancelled_flag = False
            self.start_time = None
            self.last_bytes_received = 0
            self.last_time = None
        else:
            # Fallback for non-Qt environments
            self.network_manager = None
            self.current_reply = None
            self.download_path = None
            self.download_file = None
            self.cancelled_flag = False
    
    def download(self, url: str, filename: Optional[str] = None, progress_callback: Optional[Callable[[int, int], None]] = None) -> Optional[str]:
        """
        Download file from URL.
        
        Args:
            url: Download URL
            filename: Optional filename (if None, extracted from URL)
            progress_callback: Optional callback for progress updates (bytes_received, bytes_total)
            
        Returns:
            Path to downloaded file, or None if failed/cancelled
        """
        if not QT_AVAILABLE:
            # Fallback to requests for non-Qt environments
            return self._download_with_requests(url, filename, progress_callback)
        
        try:
            import logging
            import time
            from PySide6.QtCore import QTimer
            
            logger = logging.getLogger(__name__)
            logger.info(f"Starting download from URL: {url}")
            
            # Reset state
            self.cancelled_flag = False
            self.last_bytes_received = 0
            self.last_time = None
            self.start_time = time.time()
            
            # Create temporary directory for downloads
            temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Updates'
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            # Determine filename
            if not filename:
                filename = Path(QUrl(url).fileName()).name
                if not filename or '.' not in filename:
                    # Fallback: use extension from URL or default
                    if url.endswith('.exe'):
                        filename = 'CuePoint-Setup.exe'
                    elif url.endswith('.dmg'):
                        filename = 'CuePoint.dmg'
                    else:
                        filename = 'update_file'
            
            self.download_path = temp_dir / filename
            
            # Remove existing file if present
            if self.download_path.exists():
                self.download_path.unlink()
            
            # Create request
            request = QNetworkRequest(QUrl(url))
            # GitHub Releases requires a proper User-Agent
            # Some servers block requests without User-Agent or with generic ones
            request.setRawHeader(b"User-Agent", b"CuePoint-Updater/1.0")
            # Accept any content type for binary downloads
            request.setRawHeader(b"Accept", b"*/*")
            
            # Start download
            self.current_reply = self.network_manager.get(request)
            
            # Connect signals
            self.current_reply.downloadProgress.connect(self._on_download_progress)
            self.current_reply.finished.connect(self._on_download_finished)
            self.current_reply.errorOccurred.connect(self._on_download_error)
            self.current_reply.readyRead.connect(self._on_ready_read)
            
            # Open file for writing
            self.download_file = open(self.download_path, 'wb')
            
            # Wait for download to complete (blocking)
            # In a real implementation, this would be non-blocking with signals
            # For now, we'll use a simple event loop
            from PySide6.QtCore import QEventLoop
            loop = QEventLoop()
            self.current_reply.finished.connect(loop.quit)
            self.error.connect(loop.quit)
            self.cancelled.connect(loop.quit)
            loop.exec()
            
            if self.cancelled_flag:
                if self.download_file:
                    self.download_file.close()
                if self.download_path and self.download_path.exists():
                    self.download_path.unlink()
                return None
            
            if self.download_file:
                self.download_file.close()
            
            if self.download_path and self.download_path.exists():
                return str(self.download_path)
            
            return None
            
        except Exception as e:
            error_msg = f"Download failed: {str(e)}"
            if hasattr(self, 'error'):
                self.error.emit(error_msg)
            return None
    
    def _on_ready_read(self):
        """Handle data ready to read."""
        if self.current_reply and self.download_file:
            data = self.current_reply.readAll()
            self.download_file.write(data.data())
    
    def _on_download_progress(self, bytes_received: int, bytes_total: int):
        """Handle download progress updates."""
        if self.cancelled_flag:
            return
        
        # Emit progress signal
        if hasattr(self, 'progress'):
            self.progress.emit(bytes_received, bytes_total)
        
        # Calculate download speed
        import time
        current_time = time.time()
        if self.last_time and self.last_bytes_received:
            elapsed = current_time - self.last_time
            if elapsed > 0:
                bytes_per_second = (bytes_received - self.last_bytes_received) / elapsed
                mb_per_second = bytes_per_second / (1024 * 1024)
                if hasattr(self, 'download_speed'):
                    self.download_speed.emit(mb_per_second)
                
                # Calculate time remaining
                if bytes_total > 0 and bytes_per_second > 0:
                    remaining_bytes = bytes_total - bytes_received
                    seconds_remaining = int(remaining_bytes / bytes_per_second)
                    if hasattr(self, 'time_remaining'):
                        self.time_remaining.emit(seconds_remaining)
        
        self.last_bytes_received = bytes_received
        self.last_time = current_time
    
    def _on_download_finished(self):
        """Handle download completion."""
        if self.cancelled_flag:
            return
        
        if self.current_reply:
            error_code = self.current_reply.error()
            if error_code == QNetworkReply.NetworkError.NoError:
                # Check HTTP status code
                status_code = self.current_reply.attribute(QNetworkRequest.Attribute.HttpStatusCodeAttribute)
                if status_code and status_code >= 200 and status_code < 300:
                    if self.download_file:
                        self.download_file.close()
                    if self.download_path and self.download_path.exists():
                        if hasattr(self, 'finished'):
                            self.finished.emit(str(self.download_path))
                else:
                    # HTTP error (e.g., 404, 403)
                    error_msg = f"HTTP {status_code}: {self.current_reply.attribute(QNetworkRequest.Attribute.HttpReasonPhraseAttribute) or 'Download failed'}"
                    if hasattr(self, 'error'):
                        self.error.emit(error_msg)
            else:
                # Network error
                error_msg = self.current_reply.errorString()
                if hasattr(self, 'error'):
                    self.error.emit(error_msg)
    
    def _on_download_error(self, error_code):
        """Handle download error."""
        if self.current_reply:
            error_msg = self.current_reply.errorString()
            if hasattr(self, 'error'):
                self.error.emit(error_msg)
    
    def cancel(self):
        """Cancel current download."""
        self.cancelled_flag = True
        if self.current_reply:
            self.current_reply.abort()
        if self.download_file:
            self.download_file.close()
        if hasattr(self, 'cancelled'):
            self.cancelled.emit()
    
    def _download_with_requests(self, url: str, filename: Optional[str] = None, progress_callback: Optional[Callable[[int, int], None]] = None) -> Optional[str]:
        """
        Fallback download using requests library (for non-Qt environments).
        
        Args:
            url: Download URL
            filename: Optional filename
            progress_callback: Optional progress callback
            
        Returns:
            Path to downloaded file, or None if failed
        """
        try:
            import requests
            
            # Create temporary directory
            temp_dir = Path(tempfile.gettempdir()) / 'CuePoint_Updates'
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            # Determine filename
            if not filename:
                filename = Path(url).name
                if not filename or '.' not in filename:
                    filename = 'update_file'
            
            download_path = temp_dir / filename
            
            # Download with progress
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            bytes_received = 0
            
            with open(download_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if self.cancelled_flag:
                        download_path.unlink()
                        return None
                    
                    f.write(chunk)
                    bytes_received += len(chunk)
                    
                    if progress_callback and total_size > 0:
                        progress_callback(bytes_received, total_size)
            
            return str(download_path)
            
        except Exception as e:
            return None
