#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tests for Feedback Submission

Tests feedback dialog and submission functionality.
"""

from unittest.mock import Mock, patch, MagicMock

import pytest
from PySide6.QtWidgets import QApplication

from cuepoint.ui.dialogs.report_issue_dialog import ReportIssueDialog


@pytest.fixture
def app():
    """Create QApplication instance."""
    if not QApplication.instance():
        return QApplication([])
    return QApplication.instance()


class TestFeedbackSubmission:
    """Test feedback submission functionality."""
    
    @pytest.fixture
    def dialog(self, app):
        """Create ReportIssueDialog instance."""
        return ReportIssueDialog(None)
    
    def test_submit_feedback_empty(self, dialog):
        """Test submitting empty feedback."""
        dialog.description_input.setPlainText("")
        
        with patch('PySide6.QtWidgets.QMessageBox.warning') as mock_warning:
            dialog.submit_feedback()
            mock_warning.assert_called_once()
            assert "enter your feedback" in mock_warning.call_args[0][2].lower() or "please enter" in mock_warning.call_args[0][2].lower()
    
    def test_submit_feedback_too_short(self, dialog):
        """Test submitting feedback that's too short."""
        dialog.description_input.setPlainText("short")
        
        with patch('PySide6.QtWidgets.QMessageBox.warning') as mock_warning:
            dialog.submit_feedback()
            mock_warning.assert_called_once()
            assert "more details" in mock_warning.call_args[0][2].lower() or "at least" in mock_warning.call_args[0][2].lower()
    
    @patch('cuepoint.ui.dialogs.report_issue_dialog.report_error')
    def test_submit_feedback_success(self, mock_report_error, dialog):
        """Test successful feedback submission."""
        mock_report_error.return_value = 123
        dialog.description_input.setPlainText("This is a test feedback message with enough characters.")
        dialog.category_combo.setCurrentText("Feature Request")
        
        with patch('PySide6.QtWidgets.QMessageBox.information') as mock_info:
            dialog.submit_feedback()
            
            # Verify report_error was called
            mock_report_error.assert_called_once()
            call_kwargs = mock_report_error.call_args.kwargs
            
            assert call_kwargs["error_type"] == "Feedback"
            assert "Feature Request" in call_kwargs["error_message"]
            assert call_kwargs["additional_info"]["feedback_category"] == "Feature Request"
            
            # Verify success message
            mock_info.assert_called_once()
            assert "123" in mock_info.call_args[0][2] or "submitted" in mock_info.call_args[0][2].lower()
    
    @patch('cuepoint.ui.dialogs.report_issue_dialog.report_error')
    def test_submit_feedback_failure(self, mock_report_error, dialog):
        """Test feedback submission failure."""
        mock_report_error.return_value = None
        dialog.description_input.setPlainText("This is a test feedback message with enough characters.")
        
        with patch('PySide6.QtWidgets.QMessageBox.warning') as mock_warning:
            dialog.submit_feedback()
            
            mock_warning.assert_called_once()
            assert "could not submit" in mock_warning.call_args[0][2].lower() or "failed" in mock_warning.call_args[0][2].lower()
    
    @patch('cuepoint.ui.dialogs.report_issue_dialog.report_error')
    def test_submit_feedback_exception(self, mock_report_error, dialog):
        """Test feedback submission with exception."""
        mock_report_error.side_effect = Exception("Network error")
        dialog.description_input.setPlainText("This is a test feedback message with enough characters.")
        
        with patch('PySide6.QtWidgets.QMessageBox.critical') as mock_critical:
            dialog.submit_feedback()
            
            mock_critical.assert_called_once()
            assert "error" in mock_critical.call_args[0][2].lower()
    
    def test_feedback_categories(self, dialog):
        """Test feedback categories are available."""
        categories = [dialog.category_combo.itemText(i) for i in range(dialog.category_combo.count())]
        assert len(categories) > 0
        assert "Bug Report" in categories or "Feature Request" in categories

