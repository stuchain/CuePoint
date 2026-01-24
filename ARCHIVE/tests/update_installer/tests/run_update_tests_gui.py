#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI Test Runner for Update System

Shows test progress and results in a window.
"""

import sys
import unittest
import threading
from pathlib import Path
from datetime import datetime

try:
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QTextEdit, QPushButton, QLabel, QProgressBar, QScrollArea
    )
    from PySide6.QtCore import Qt, QThread, Signal, QTimer
    QT_AVAILABLE = True
except ImportError:
    QT_AVAILABLE = False
    print("ERROR: PySide6 not available. Please install PySide6 to run GUI tests.")
    sys.exit(1)

# Add SRC to path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "SRC"))


class TestRunnerThread(QThread):
    """Thread for running tests without blocking UI."""
    
    test_started = Signal(str)  # Test name
    test_finished = Signal(str, bool, str)  # Test name, passed, message
    suite_finished = Signal(int, int, int, int)  # total, passed, failed, errors
    output = Signal(str)  # Output text
    
    def __init__(self, test_suite):
        super().__init__()
        self.test_suite = test_suite
        self.output_buffer = []
    
    def run(self):
        """Run the tests."""
        class TestResultHandler(unittest.TextTestResult):
            """Custom test result handler that emits signals."""
            
            def __init__(self, stream, descriptions, verbosity, parent_thread):
                super().__init__(stream, descriptions, verbosity)
                self.parent_thread = parent_thread
            
            def startTest(self, test):
                super().startTest(test)
                test_name = self.getDescription(test)
                self.parent_thread.test_started.emit(test_name)
                self.parent_thread.output.emit(f"\n{'='*70}\n")
                self.parent_thread.output.emit(f"Running: {test_name}\n")
                self.parent_thread.output.emit(f"{'='*70}\n")
            
            def addSuccess(self, test):
                super().addSuccess(test)
                test_name = self.getDescription(test)
                self.parent_thread.test_finished.emit(test_name, True, "PASSED")
                self.parent_thread.output.emit(f"✅ PASSED: {test_name}\n\n")
            
            def addFailure(self, test, err):
                super().addFailure(test, err)
                test_name = self.getDescription(test)
                error_msg = self._exc_info_to_string(err, test)
                self.parent_thread.test_finished.emit(test_name, False, f"FAILED: {error_msg}")
                self.parent_thread.output.emit(f"❌ FAILED: {test_name}\n{error_msg}\n\n")
            
            def addError(self, test, err):
                super().addError(test, err)
                test_name = self.getDescription(test)
                error_msg = self._exc_info_to_string(err, test)
                self.parent_thread.test_finished.emit(test_name, False, f"ERROR: {error_msg}")
                self.parent_thread.output.emit(f"⚠️ ERROR: {test_name}\n{error_msg}\n\n")
        
        # Create custom runner
        stream = unittest.runner._WritelnDecorator(self)
        result = TestResultHandler(stream, True, 2, self)
        
        # Run tests
        self.test_suite.run(result)
        
        # Emit final results
        total = result.testsRun
        passed = total - len(result.failures) - len(result.errors)
        failed = len(result.failures)
        errors = len(result.errors)
        
        self.suite_finished.emit(total, passed, failed, errors)
    
    def write(self, text):
        """Write output (for TextTestResult)."""
        self.output.emit(text)
    
    def flush(self):
        """Flush output."""
        pass


class TestRunnerWindow(QMainWindow):
    """Main window for test runner."""
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Update System Test Runner")
        self.setMinimumSize(900, 700)
        
        # Test runner thread
        self.test_thread = None
        
        # Statistics
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.error_tests = 0
        
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up the UI."""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout(central_widget)
        layout.setSpacing(10)
        layout.setContentsMargins(15, 15, 15, 15)
        
        # Title
        title = QLabel("Update System Comprehensive Test Suite")
        title_font = title.font()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)
        
        # Status bar
        status_layout = QHBoxLayout()
        self.status_label = QLabel("Ready to run tests")
        self.status_label.setStyleSheet("font-size: 12px; padding: 5px;")
        status_layout.addWidget(self.status_label)
        status_layout.addStretch()
        
        self.stats_label = QLabel("Tests: 0 | Passed: 0 | Failed: 0 | Errors: 0")
        self.stats_label.setStyleSheet("font-size: 11px; color: #666;")
        status_layout.addWidget(self.stats_label)
        layout.addLayout(status_layout)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 0)  # Indeterminate initially
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Current test label
        self.current_test_label = QLabel()
        self.current_test_label.setStyleSheet("font-size: 11px; color: #333; padding: 5px;")
        self.current_test_label.setWordWrap(True)
        self.current_test_label.setVisible(False)
        layout.addWidget(self.current_test_label)
        
        # Output area
        output_label = QLabel("Test Output:")
        output_label.setStyleSheet("font-size: 12px; font-weight: bold;")
        layout.addWidget(output_label)
        
        self.output_text = QTextEdit()
        self.output_text.setReadOnly(True)
        self.output_text.setFontFamily("Consolas")
        self.output_text.setFontPointSize(9)
        self.output_text.setStyleSheet("""
            QTextEdit {
                background-color: #1e1e1e;
                color: #d4d4d4;
                border: 1px solid #3e3e3e;
                border-radius: 4px;
                padding: 5px;
            }
        """)
        layout.addWidget(self.output_text)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.run_button = QPushButton("▶ Run All Tests")
        self.run_button.setStyleSheet("""
            QPushButton {
                background-color: #0078d4;
                color: white;
                font-weight: bold;
                padding: 8px 20px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #106ebe;
            }
            QPushButton:disabled {
                background-color: #666;
            }
        """)
        self.run_button.clicked.connect(self.run_tests)
        button_layout.addWidget(self.run_button)
        
        self.clear_button = QPushButton("Clear Output")
        self.clear_button.clicked.connect(self.clear_output)
        button_layout.addWidget(self.clear_button)
        
        self.close_button = QPushButton("Close")
        self.close_button.clicked.connect(self.close)
        button_layout.addWidget(self.close_button)
        
        layout.addLayout(button_layout)
    
    def clear_output(self):
        """Clear the output text."""
        self.output_text.clear()
        self.status_label.setText("Ready to run tests")
        self.stats_label.setText("Tests: 0 | Passed: 0 | Failed: 0 | Errors: 0")
        self.current_test_label.setVisible(False)
        self.progress_bar.setVisible(False)
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.error_tests = 0
    
    def run_tests(self):
        """Run all tests."""
        self.clear_output()
        self.run_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Indeterminate
        self.current_test_label.setVisible(True)
        self.status_label.setText("Running tests...")
        
        self.output_text.append("=" * 70)
        self.output_text.append("UPDATE SYSTEM COMPREHENSIVE TEST SUITE")
        self.output_text.append("=" * 70)
        self.output_text.append("")
        self.output_text.append(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        self.output_text.append("")
        
        # Import test classes
        try:
            from test_update_system_complete import (
                TestVersionFiltering,
                TestUpdateDialog,
                TestContextMenu,
                TestDownloadURLExtraction,
                TestStartupUpdateCheck,
                TestErrorHandling,
                TestVersionUtils,
                TestRealWorldScenarios,
            )
            
            loader = unittest.TestLoader()
            suite = unittest.TestSuite()
            
            test_classes = [
                TestVersionFiltering,
                TestUpdateDialog,
                TestContextMenu,
                TestDownloadURLExtraction,
                TestStartupUpdateCheck,
                TestErrorHandling,
                TestVersionUtils,
                TestRealWorldScenarios,
            ]
            
            for test_class in test_classes:
                tests = loader.loadTestsFromTestCase(test_class)
                suite.addTests(tests)
            
            # Create and start test thread
            self.test_thread = TestRunnerThread(suite)
            self.test_thread.test_started.connect(self.on_test_started)
            self.test_thread.test_finished.connect(self.on_test_finished)
            self.test_thread.suite_finished.connect(self.on_suite_finished)
            self.test_thread.output.connect(self.on_output)
            
            self.test_thread.start()
            
        except Exception as e:
            self.output_text.append(f"❌ ERROR: Failed to load tests: {e}")
            import traceback
            self.output_text.append(traceback.format_exc())
            self.run_button.setEnabled(True)
            self.progress_bar.setVisible(False)
    
    def on_test_started(self, test_name):
        """Handle test started signal."""
        self.current_test_label.setText(f"Running: {test_name}")
        self.current_test_label.setStyleSheet("font-size: 11px; color: #0078d4; padding: 5px;")
    
    def on_test_finished(self, test_name, passed, message):
        """Handle test finished signal."""
        if passed:
            self.passed_tests += 1
        else:
            if "ERROR" in message:
                self.error_tests += 1
            else:
                self.failed_tests += 1
        
        self.total_tests += 1
        self.update_stats()
    
    def on_suite_finished(self, total, passed, failed, errors):
        """Handle suite finished signal."""
        self.total_tests = total
        self.passed_tests = passed
        self.failed_tests = failed
        self.error_tests = errors
        
        self.progress_bar.setVisible(False)
        self.current_test_label.setVisible(False)
        self.run_button.setEnabled(True)
        
        self.output_text.append("")
        self.output_text.append("=" * 70)
        self.output_text.append("TEST SUMMARY")
        self.output_text.append("=" * 70)
        self.output_text.append(f"Tests run: {total}")
        self.output_text.append(f"Passed: {passed}")
        self.output_text.append(f"Failed: {failed}")
        self.output_text.append(f"Errors: {errors}")
        self.output_text.append("")
        
        if failed == 0 and errors == 0:
            self.status_label.setText("✅ ALL TESTS PASSED!")
            self.status_label.setStyleSheet("font-size: 12px; padding: 5px; color: #00aa00; font-weight: bold;")
            self.output_text.append("✅ ALL TESTS PASSED!")
            self.output_text.append("The update system is ready for production.")
        else:
            self.status_label.setText(f"❌ {failed + errors} TEST(S) FAILED")
            self.status_label.setStyleSheet("font-size: 12px; padding: 5px; color: #cc0000; font-weight: bold;")
            self.output_text.append(f"❌ {failed + errors} TEST(S) FAILED")
            self.output_text.append("Please review the failures above.")
        
        self.output_text.append("")
        self.output_text.append(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Scroll to bottom
        self.output_text.verticalScrollBar().setValue(
            self.output_text.verticalScrollBar().maximum()
        )
        
        self.update_stats()
    
    def on_output(self, text):
        """Handle output signal."""
        self.output_text.insertPlainText(text)
        # Auto-scroll to bottom
        self.output_text.verticalScrollBar().setValue(
            self.output_text.verticalScrollBar().maximum()
        )
    
    def update_stats(self):
        """Update statistics label."""
        self.stats_label.setText(
            f"Tests: {self.total_tests} | "
            f"Passed: {self.passed_tests} | "
            f"Failed: {self.failed_tests} | "
            f"Errors: {self.error_tests}"
        )
        
        # Update progress bar if we know total
        if self.total_tests > 0:
            self.progress_bar.setRange(0, self.total_tests)
            self.progress_bar.setValue(self.passed_tests + self.failed_tests + self.error_tests)


def main():
    """Main entry point."""
    if not QT_AVAILABLE:
        print("ERROR: PySide6 not available. Please install PySide6 to run GUI tests.")
        sys.exit(1)
    
    app = QApplication(sys.argv)
    app.setStyle('Fusion')  # Use Fusion style for better appearance
    
    window = TestRunnerWindow()
    window.show()
    
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
