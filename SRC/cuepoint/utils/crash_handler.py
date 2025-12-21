#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crash Handling System

Implements Step 6.3 - Crash Handling with:
- Global exception handler
- Thread exception handling
- Crash report generation
- Support bundle creation
- Crash dialog UI
"""

import json
import logging
import sys
import threading
import traceback
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from PySide6.QtCore import QObject, Signal

from cuepoint.utils.logger import CrashLogger, CuePointLogger
from cuepoint.utils.paths import AppPaths, PathDiagnostics

try:
    from cuepoint.version import get_build_info
except ImportError:
    def get_build_info():
        return {"version": "1.0.0"}


class CrashHandler(QObject):
    """Global crash handler for unhandled exceptions.
    
    Implements Step 6.3.1.1 - Global Exception Hook.
    """
    
    # Signal emitted when crash occurs
    crash_occurred = Signal(Exception, str)  # exception, traceback
    
    def __init__(self):
        """Initialize crash handler."""
        super().__init__()
        self._original_excepthook = sys.excepthook
        self._crash_dialog_shown = False
        self._install_handler()
    
    def _install_handler(self):
        """Install global exception handler."""
        sys.excepthook = self._handle_exception
    
    def _handle_exception(self, exc_type, exc_value, exc_traceback):
        """Handle unhandled exception.
        
        Args:
            exc_type: Exception type.
            exc_value: Exception value.
            exc_traceback: Traceback object.
        """
        # Don't handle if in interactive mode (for debugging)
        if hasattr(sys, 'ps1'):
            self._original_excepthook(exc_type, exc_value, exc_traceback)
            return
        
        # Create exception object
        exception = exc_value if isinstance(exc_value, Exception) else exc_type()
        
        # Get full traceback
        traceback_str = ''.join(
            traceback.format_exception(exc_type, exc_value, exc_traceback)
        )
        
        # Log the crash
        logger = logging.getLogger(__name__)
        logger.critical(
            f"Unhandled exception: {exc_type.__name__}: {exc_value}",
            exc_info=(exc_type, exc_value, exc_traceback)
        )
        
        # Create crash log
        crash_log = CrashLogger.create_crash_log()
        CrashLogger.write_crash_info(crash_log, exception, traceback_str)
        
        # Generate crash report
        crash_report = CrashReport.generate_report(exception, traceback_str)
        crash_report_path = crash_log.with_suffix('.json')
        CrashReport.save_report(crash_report, crash_report_path)
        
        # Show crash dialog (only once)
        if not self._crash_dialog_shown:
            self._crash_dialog_shown = True
            self._show_crash_dialog(exception, traceback_str, crash_log, crash_report_path)
        
        # Report to GitHub Issues (Step 11.2)
        try:
            from cuepoint.utils.error_reporter import report_error
            report_error(
                error_type=exc_type.__name__,
                error_message=str(exc_value),
                traceback=traceback_str,
                additional_info={
                    'crash_report': True,
                    'crash_log': str(crash_log),
                    'crash_report_path': str(crash_report_path)
                }
            )
        except Exception as e:
            logger.warning(f"Failed to report error to GitHub: {e}")
        
        # Emit signal
        self.crash_occurred.emit(exception, traceback_str)
    
    def _show_crash_dialog(self, exception: Exception, traceback_str: str, 
                          crash_log: Path, crash_report_path: Path):
        """Show crash dialog to user.
        
        Args:
            exception: Exception that caused crash.
            traceback_str: Full traceback.
            crash_log: Path to crash log file.
            crash_report_path: Path to crash report JSON.
        """
        # Use QApplication to show dialog
        from PySide6.QtWidgets import QApplication
        app = QApplication.instance()
        if app is None:
            # No GUI available, just exit
            sys.exit(1)
        
        # Import here to avoid circular dependencies
        try:
            from cuepoint.ui.dialogs.crash_dialog import CrashDialog
            dialog = CrashDialog(exception, traceback_str, crash_log, crash_report_path)
            dialog.exec()
        except ImportError:
            # Crash dialog not available, show simple message box
            from PySide6.QtWidgets import QMessageBox
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Critical)
            msg.setWindowTitle("Application Error")
            msg.setText(
                f"An unexpected error occurred:\n\n"
                f"{type(exception).__name__}: {str(exception)}\n\n"
                f"Crash log saved to:\n{crash_log}\n\n"
                f"The application will now exit."
            )
            msg.exec()
    
    def restore_handler(self):
        """Restore original exception handler."""
        sys.excepthook = self._original_excepthook


class ThreadExceptionHandler:
    """Handle exceptions in background threads.
    
    Implements Step 6.3.1.2 - Thread Exception Handling.
    """
    
    @staticmethod
    def install_thread_exception_handler():
        """Install exception handler for threads."""
        def thread_exception_handler(args):
            exc_type, exc_value, exc_traceback = args.exc_type, args.exc_value, args.exc_traceback
            
            # Log exception
            logger = logging.getLogger(__name__)
            logger.error(
                f"Unhandled exception in thread {threading.current_thread().name}: "
                f"{exc_type.__name__}: {exc_value}",
                exc_info=(exc_type, exc_value, exc_traceback)
            )
            
            # Create crash log
            exception = exc_value if isinstance(exc_value, Exception) else exc_type()
            traceback_str = ''.join(
                traceback.format_exception(exc_type, exc_value, exc_traceback)
            )
            
            crash_log = CrashLogger.create_crash_log()
            CrashLogger.write_crash_info(crash_log, exception, traceback_str)
            
            # Generate crash report
            crash_report = CrashReport.generate_report(exception, traceback_str)
            crash_report_path = crash_log.with_suffix('.json')
            CrashReport.save_report(crash_report, crash_report_path)
            
            # Report to GitHub Issues (Step 11.2)
            try:
                from cuepoint.utils.error_reporter import report_error
                report_error(
                    error_type=exc_type.__name__,
                    error_message=str(exc_value),
                    traceback=traceback_str,
                    additional_info={
                        'crash_report': True,
                        'thread_name': threading.current_thread().name,
                        'crash_log': str(crash_log),
                        'crash_report_path': str(crash_report_path)
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to report thread error to GitHub: {e}")
            
            # Show error dialog (on main thread)
            from PySide6.QtWidgets import QApplication
            app = QApplication.instance()
            if app:
                # Post event to main thread
                from PySide6.QtCore import QTimer
                QTimer.singleShot(0, lambda: _show_thread_error_dialog(exception, crash_log))
        
        threading.excepthook = thread_exception_handler


def _show_thread_error_dialog(exception: Exception, crash_log: Path):
    """Show error dialog for thread exception."""
    from PySide6.QtWidgets import QMessageBox
    msg = QMessageBox()
    msg.setIcon(QMessageBox.Warning)
    msg.setWindowTitle("Background Error")
    msg.setText(
        f"An error occurred in a background thread:\n\n"
        f"{type(exception).__name__}: {str(exception)}\n\n"
        f"Error log saved to:\n{crash_log}"
    )
    msg.exec()


class ExceptionContext:
    """Collect context information for exceptions.
    
    Implements Step 6.3.1.3 - Exception Context Collection.
    """
    
    _context_stack = []
    
    @staticmethod
    def push_context(context: str):
        """Push context onto stack.
        
        Args:
            context: Context description.
        """
        from datetime import datetime
        ExceptionContext._context_stack.append({
            "context": context,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 10 contexts
        if len(ExceptionContext._context_stack) > 10:
            ExceptionContext._context_stack.pop(0)
    
    @staticmethod
    def pop_context():
        """Pop context from stack."""
        if ExceptionContext._context_stack:
            ExceptionContext._context_stack.pop()
    
    @staticmethod
    def get_context() -> Dict[str, Any]:
        """Get current context information.
        
        Returns:
            Dictionary with context information.
        """
        context = {
            "application_context": list(ExceptionContext._context_stack),
        }
        
        try:
            import platform
            context["system"] = {
                "platform": platform.system(),
                "platform_version": platform.version(),
                "python_version": platform.python_version(),
            }
        except Exception:
            pass
        
        try:
            context["application"] = get_build_info()
        except Exception:
            pass
        
        return context


class CrashReport:
    """Generate structured crash reports.
    
    Implements Step 6.3.2 - Crash Report Generation.
    """
    
    @staticmethod
    def generate_report(
        exception: Exception,
        traceback_str: str,
        context: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Generate crash report.
        
        Args:
            exception: Exception that caused crash.
            traceback_str: Full traceback.
            context: Additional context information.
            
        Returns:
            Crash report dictionary.
        """
        from datetime import datetime
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "exception": {
                "type": type(exception).__name__,
                "message": str(exception),
                "traceback": traceback_str,
            },
            "application": get_build_info(),
            "system": {
                "platform": platform.system(),
                "platform_version": platform.version(),
                "python_version": platform.python_version(),
            },
            "context": context or ExceptionContext.get_context(),
            "paths": PathDiagnostics.collect_diagnostics(),
        }
        
        # Add recent logs
        try:
            report["recent_logs"] = CrashLogger._get_recent_logs(200)
        except Exception:
            report["recent_logs"] = "Error retrieving recent logs"
        
        # Add metadata
        report = CrashReportMetadata.add_metadata(report)
        
        return report
    
    @staticmethod
    def save_report(report: Dict[str, Any], file_path: Path) -> None:
        """Save crash report to file.
        
        Args:
            report: Crash report dictionary.
            file_path: Path to save report.
        """
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)


class CrashReportMetadata:
    """Add metadata to crash reports.
    
    Implements Step 6.3.2.2 - Crash Report Metadata.
    """
    
    @staticmethod
    def generate_report_id(exception_type: str, traceback_str: str) -> str:
        """Generate unique report ID based on exception.
        
        Args:
            exception_type: Exception type name.
            traceback_str: Traceback string.
            
        Returns:
            Unique report ID.
        """
        import hashlib

        # Create hash from exception type and first few lines of traceback
        hash_input = f"{exception_type}\n{traceback_str[:500]}"
        hash_obj = hashlib.sha256(hash_input.encode())
        return hash_obj.hexdigest()[:16]
    
    @staticmethod
    def add_metadata(report: Dict[str, Any]) -> Dict[str, Any]:
        """Add metadata to crash report.
        
        Args:
            report: Crash report dictionary.
            
        Returns:
            Report with metadata added.
        """
        exception_type = report["exception"]["type"]
        traceback_str = report["exception"]["traceback"]
        
        report["metadata"] = {
            "report_id": CrashReportMetadata.generate_report_id(
                exception_type,
                traceback_str
            ),
            "session_id": str(uuid.uuid4()),
            "timestamp": report["timestamp"],
        }
        
        return report


# Import platform here to avoid issues
import platform
