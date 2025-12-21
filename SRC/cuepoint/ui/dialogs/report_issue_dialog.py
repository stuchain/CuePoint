#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Issue Reporting Dialog (Step 9.5)

Dialog for reporting issues with pre-filled information and GitHub integration.
"""

import os
import platform
import urllib.parse
from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
)

from cuepoint.utils.i18n import tr
from cuepoint.utils.support_bundle import SupportBundleGenerator
from cuepoint.utils.error_reporter import report_error
from cuepoint.version import get_version


class ReportIssueDialog(QDialog):
    """Dialog for reporting issues to GitHub."""

    def __init__(self, parent=None):
        """Initialize issue reporting dialog."""
        super().__init__(parent)
        self._setup_ui()
        self._prefill_info()

    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle(tr("issue.report.title", "Report Issue"))
        self.setModal(True)
        self.resize(600, 500)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel(tr("issue.report.title", "Report Issue"))
        title_font = title.font()
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Description
        description = QLabel(
            tr(
                "issue.report.description",
                "Report an issue or bug. This will open GitHub with pre-filled "
                "information to help us resolve the issue quickly.",
            )
        )
        description.setWordWrap(True)
        layout.addWidget(description)

        layout.addSpacing(10)

        # Issue type
        type_label = QLabel(tr("issue.report.type", "Issue Type:"))
        layout.addWidget(type_label)

        self.issue_type = QComboBox()
        self.issue_type.addItems(
            [
                tr("issue.type.bug", "Bug"),
                tr("issue.type.feature", "Feature Request"),
                tr("issue.type.question", "Question"),
                tr("issue.type.other", "Other"),
            ]
        )
        layout.addWidget(self.issue_type)
        
        # Feedback category (for Step 11.8)
        category_label = QLabel(tr("feedback.category", "Category:"))
        layout.addWidget(category_label)
        
        self.category_combo = QComboBox()
        self.category_combo.addItems(
            [
                tr("feedback.category.bug", "Bug Report"),
                tr("feedback.category.feature", "Feature Request"),
                tr("feedback.category.general", "General Feedback"),
                tr("feedback.category.usability", "Usability Issue"),
                tr("feedback.category.performance", "Performance Issue"),
            ]
        )
        layout.addWidget(self.category_combo)

        # Title
        title_label = QLabel(tr("issue.report.title_label", "Title:"))
        layout.addWidget(title_label)

        self.title_input = QLineEdit()
        self.title_input.setPlaceholderText(tr("issue.report.title_placeholder", "Brief description of the issue"))
        layout.addWidget(self.title_input)

        # Description
        desc_label = QLabel(tr("issue.report.description_label", "Description:"))
        layout.addWidget(desc_label)

        self.description_input = QTextEdit()
        self.description_input.setPlaceholderText(
            tr(
                "issue.report.description_placeholder",
                "Describe the issue, steps to reproduce, and expected behavior...",
            )
        )
        self.description_input.setMinimumHeight(150)
        layout.addWidget(self.description_input)

        # Include support bundle
        self.include_bundle_checkbox = QCheckBox(tr("issue.report.include_bundle", "Generate and attach support bundle"))
        self.include_bundle_checkbox.setChecked(True)
        layout.addWidget(self.include_bundle_checkbox)
        
        # Status label for feedback submission (Step 11.8)
        self.status_label = QLabel("")
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)

        layout.addStretch()

        # Buttons
        button_layout = QHBoxLayout()

        cancel_button = QPushButton(tr("button.cancel", "Cancel"))
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(cancel_button)

        button_layout.addStretch()

        # Add submit feedback button (Step 11.8)
        self.submit_feedback_button = QPushButton(tr("feedback.submit", "Submit Feedback"))
        self.submit_feedback_button.clicked.connect(self.submit_feedback)
        button_layout.addWidget(self.submit_feedback_button)

        self.report_button = QPushButton(tr("issue.report.open_github", "Open GitHub Issue"))
        self.report_button.setDefault(True)
        self.report_button.clicked.connect(self.open_github_issue)
        button_layout.addWidget(self.report_button)

        layout.addLayout(button_layout)

    def _prefill_info(self):
        """Pre-fill issue information with system details."""
        version = get_version()
        system = platform.system()
        release = platform.release()

        # Pre-fill description with system info
        prefill = tr(
            "issue.report.template",
            """**CuePoint Version:** {version}
**Operating System:** {system} {release}

**Issue Description:**
[Describe the issue here]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Additional Information:**
[Any other relevant information]""",
        ).format(version=version, system=system, release=release)

        self.description_input.setPlainText(prefill)

    def open_github_issue(self):
        """Open GitHub issue page with pre-filled information."""
        # Get issue URL from environment or use default
        issue_url = os.environ.get("CUEPOINT_ISSUE_URL", "https://github.com/your-repo/cuepoint/issues/new")

        # Get form data
        issue_type = self.issue_type.currentText()
        title = self.title_input.text() or tr("issue.report.default_title", "Issue Report")
        description = self.description_input.toPlainText()

        # Add system info if not already included
        version = get_version()
        system = platform.system()
        release = platform.release()

        if "CuePoint Version:" not in description:
            description = tr(
                "issue.report.system_info",
                "**CuePoint Version:** {version}\n**Operating System:** {system} {release}\n\n{description}",
            ).format(version=version, system=system, release=release, description=description)

        # Generate support bundle if requested
        bundle_path = None
        if self.include_bundle_checkbox.isChecked():
            try:
                from cuepoint.utils.paths import AppPaths

                output_dir = AppPaths.exports_dir()
                output_dir.mkdir(parents=True, exist_ok=True)
                bundle_path = SupportBundleGenerator.generate_bundle(output_dir, sanitize=True)

                description += tr(
                    "issue.report.bundle_note",
                    "\n\n**Support Bundle:** {filename} (see attached)",
                ).format(filename=bundle_path.name)
            except Exception as e:
                description += tr("issue.report.bundle_error", "\n\n**Note:** Failed to generate support bundle: {error}").format(error=str(e))

        # URL encode parameters
        params = {
            "title": f"[{issue_type}] {title}",
            "body": description,
            "labels": issue_type.lower().replace(" ", "-"),
        }

        query_string = urllib.parse.urlencode(params)
        full_url = f"{issue_url}?{query_string}"

        # Open in browser
        QDesktopServices.openUrl(QUrl(full_url))

        # Show message about support bundle
        if bundle_path:
            msg = QMessageBox(self)
            msg.setIcon(QMessageBox.Information)
            msg.setWindowTitle(tr("issue.report.bundle_title", "Support Bundle Generated"))
            msg.setText(
                tr(
                    "issue.report.bundle_message",
                    "GitHub issue page opened.\n\nSupport bundle generated: {filename}\nPlease attach it to the issue.",
                ).format(filename=bundle_path.name)
            )
            msg.exec()

        self.accept()
    
    def submit_feedback(self):
        """Submit feedback to GitHub Issues (Step 11.8)."""
        feedback_text = self.description_input.toPlainText().strip()
        category = self.category_combo.currentText()
        
        # Validate feedback
        if not feedback_text:
            QMessageBox.warning(self, tr("feedback.invalid", "Invalid Feedback"), 
                              tr("feedback.enter_feedback", "Please enter your feedback."))
            return
        
        if len(feedback_text) < 10:
            QMessageBox.warning(self, tr("feedback.invalid", "Invalid Feedback"), 
                              tr("feedback.more_details", "Please provide more details (at least 10 characters)."))
            return
        
        # Show progress
        self.status_label.setText(tr("feedback.submitting", "Submitting feedback..."))
        self.submit_feedback_button.setEnabled(False)
        
        try:
            # Create GitHub issue using error reporter pattern
            issue_number = report_error(
                error_type="Feedback",
                error_message=f"{category}: {feedback_text[:200]}",
                traceback=None,
                additional_info={
                    "feedback_category": category,
                    "feedback_text": feedback_text,
                    "feedback_type": "user_feedback",
                    "issue_type": self.issue_type.currentText(),
                    "title": self.title_input.text() or "User Feedback",
                }
            )
            
            if issue_number:
                QMessageBox.information(
                    self,
                    tr("feedback.submitted", "Feedback Submitted"),
                    tr("feedback.thank_you", "Thank you for your feedback! It has been submitted as issue #{issue_number}.").format(issue_number=issue_number)
                )
                self.accept()
            else:
                QMessageBox.warning(
                    self,
                    tr("feedback.failed", "Submission Failed"),
                    tr("feedback.failed_message", "Could not submit feedback. Please try again later or submit via GitHub Issues.")
                )
        except Exception as e:
            QMessageBox.critical(
                self,
                tr("feedback.error", "Error"),
                tr("feedback.error_message", "An error occurred while submitting feedback: {error}").format(error=str(e))
            )
        finally:
            self.status_label.setText("")
            self.submit_feedback_button.setEnabled(True)
