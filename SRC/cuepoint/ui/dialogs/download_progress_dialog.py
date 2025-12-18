#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Download Progress Dialog Module

Shows download progress for update downloads.
"""

import sys
from typing import Optional

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QLabel,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
)

from cuepoint.update.update_downloader import UpdateDownloader


class DownloadProgressDialog(QDialog):
    """
    Dialog showing download progress for updates.
    
    Displays progress bar, download speed, time remaining, and cancel button.
    """
    
    def __init__(self, download_url: str, parent=None):
        """
        Initialize download progress dialog.
        
        Args:
            download_url: URL to download from
            parent: Parent widget
        """
        super().__init__(parent)
        self.download_url = download_url
        self.downloader: Optional[UpdateDownloader] = None
        self.downloaded_file: Optional[str] = None
        self.cancelled = False
        
        self.setWindowTitle("Downloading Update")
        self.setMinimumWidth(400)
        self.setModal(True)
        
        self.init_ui()
        self.start_download()
    
    def init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        
        # Title
        title = QLabel("Downloading Update...")
        title_font = title.font()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        self.progress_bar.setValue(0)
        self.progress_bar.setFormat("%p%")
        layout.addWidget(self.progress_bar)
        
        # Status labels
        self.size_label = QLabel("Preparing download...")
        self.size_label.setWordWrap(True)
        layout.addWidget(self.size_label)
        
        self.speed_label = QLabel("")
        self.speed_label.setWordWrap(True)
        layout.addWidget(self.speed_label)
        
        self.time_label = QLabel("")
        self.time_label.setWordWrap(True)
        layout.addWidget(self.time_label)
        
        # Buttons
        button_box = QDialogButtonBox(Qt.Horizontal, self)
        
        self.cancel_button = QPushButton("Cancel")
        button_box.addButton(self.cancel_button, QDialogButtonBox.RejectRole)
        
        layout.addWidget(button_box)
        
        # Connect signals
        self.cancel_button.clicked.connect(self.on_cancel)
    
    def start_download(self):
        """Start the download."""
        try:
            self.downloader = UpdateDownloader(self)
            
            # Connect signals
            self.downloader.progress.connect(self.on_progress)
            self.downloader.download_speed.connect(self.on_speed_update)
            self.downloader.time_remaining.connect(self.on_time_update)
            self.downloader.finished.connect(self.on_download_finished)
            self.downloader.error.connect(self.on_download_error)
            self.downloader.cancelled.connect(self.on_download_cancelled)
            
            # Start download immediately (non-blocking via signals)
            QTimer.singleShot(100, self._do_download)
            
        except Exception as e:
            self.on_download_error(f"Failed to start download: {str(e)}")
    
    def _do_download(self):
        """Execute download (called via QTimer, runs in main thread but processes events)."""
        if self.downloader:
            try:
                # Download will emit signals for progress updates
                # QEventLoop.exec() processes Qt events, so UI stays responsive
                # The finished signal will be emitted when download completes
                result = self.downloader.download(self.download_url)
                # Note: finished signal will be emitted by downloader, so we don't need to handle result here
                # But if download() returns immediately (non-blocking), we should check result
                if result and not self.downloaded_file:
                    self.downloaded_file = result
                    self.on_download_finished(result)
            except Exception as e:
                self.on_download_error(str(e))
    
    def on_progress(self, bytes_received: int, bytes_total: int):
        """Handle progress update."""
        if bytes_total > 0:
            percent = int((bytes_received / bytes_total) * 100)
            self.progress_bar.setValue(percent)
            
            # Update size label
            mb_received = bytes_received / (1024 * 1024)
            mb_total = bytes_total / (1024 * 1024)
            self.size_label.setText(f"Downloaded: {mb_received:.1f} MB / {mb_total:.1f} MB")
    
    def on_speed_update(self, mb_per_second: float):
        """Handle download speed update."""
        self.speed_label.setText(f"Speed: {mb_per_second:.2f} MB/s")
    
    def on_time_update(self, seconds_remaining: int):
        """Handle time remaining update."""
        if seconds_remaining > 0:
            minutes = seconds_remaining // 60
            seconds = seconds_remaining % 60
            if minutes > 0:
                self.time_label.setText(f"Time remaining: {minutes}m {seconds}s")
            else:
                self.time_label.setText(f"Time remaining: {seconds}s")
        else:
            self.time_label.setText("")
    
    def on_download_finished(self, file_path: str):
        """Handle download completion."""
        self.downloaded_file = file_path
        self.size_label.setText("Download complete!")
        self.speed_label.setText("")
        self.time_label.setText("")
        self.progress_bar.setValue(100)
        
        # Close dialog after a brief moment to show completion
        from PySide6.QtCore import QTimer
        QTimer.singleShot(500, self.accept)
    
    def on_download_error(self, error_message: str):
        """Handle download error."""
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.warning(self, "Download Failed", f"Failed to download update:\n\n{error_message}")
        self.reject()
    
    def on_download_cancelled(self):
        """Handle download cancellation."""
        self.cancelled = True
        self.reject()
    
    def on_cancel(self):
        """Handle cancel button click."""
        if self.downloader:
            self.downloader.cancel()
        self.cancelled = True
        self.reject()
    
    def get_downloaded_file(self) -> Optional[str]:
        """Get path to downloaded file."""
        return self.downloaded_file
