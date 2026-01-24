#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Changelog Viewer (Step 9.6)

Viewer for displaying release notes and changelog information.
"""

import re
from pathlib import Path
from typing import Dict, List, Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
)

from cuepoint.utils.i18n import tr


class ChangelogViewer(QDialog):
    """Viewer for changelog and release notes."""

    def __init__(self, parent=None):
        """Initialize changelog viewer."""
        super().__init__(parent)
        self.changelog_data: List[Dict] = []
        self._load_changelog()
        self._setup_ui()

    def _setup_ui(self):
        """Set up UI components."""
        self.setWindowTitle(tr("changelog.title", "What's New"))
        self.setModal(True)
        self.resize(700, 600)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel(tr("changelog.title", "What's New"))
        title_font = title.font()
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Version selector (if multiple versions)
        if len(self.changelog_data) > 1:
            version_layout = QHBoxLayout()
            version_layout.addWidget(QLabel(tr("changelog.version", "Version:")))

            self.version_combo = QComboBox()
            for entry in self.changelog_data:
                version_str = f"{entry['version']} - {entry['date']}"
                self.version_combo.addItem(version_str, entry)

            self.version_combo.currentIndexChanged.connect(self._on_version_changed)
            version_layout.addWidget(self.version_combo)
            version_layout.addStretch()
            layout.addLayout(version_layout)

        # Changelog content
        self.content_browser = QTextBrowser()
        self.content_browser.setOpenExternalLinks(True)
        self.content_browser.setReadOnly(True)
        layout.addWidget(self.content_browser)

        # Display first version
        if self.changelog_data:
            self._display_version(self.changelog_data[0])

        # Close button
        button_layout = QHBoxLayout()
        button_layout.addStretch()

        close_button = QPushButton(tr("button.close", "Close"))
        close_button.setDefault(True)
        close_button.clicked.connect(self.accept)
        button_layout.addWidget(close_button)

        button_layout.addStretch()
        layout.addLayout(button_layout)

    def _load_changelog(self):
        """Load changelog from file."""
        changelog_paths = [
            Path("CHANGELOG.md"),
            Path("docs/CHANGELOG.md"),
            Path("DOCS/CHANGELOG.md"),
            Path("DOCS/RELEASE/changelog.md"),
            Path("CHANGELOG.txt"),
        ]

        changelog_content = None
        for path in changelog_paths:
            if path.exists():
                try:
                    changelog_content = path.read_text(encoding="utf-8")
                    break
                except Exception:
                    continue

        if changelog_content:
            self.changelog_data = self._parse_changelog(changelog_content)
        else:
            # Fallback: create default changelog
            from cuepoint.version import get_version
            from datetime import datetime

            version = get_version()
            # Use current date instead of hardcoded date
            current_date = datetime.now().strftime("%Y-%m-%d")
            self.changelog_data = [
                {
                    "version": version,
                    "date": current_date,
                    "content": f"<h2>Version {version}</h2><p>CuePoint {version}</p>",
                }
            ]

    def _parse_changelog(self, content: str) -> List[Dict]:
        """Parse markdown changelog into structured data.

        Args:
            content: Markdown changelog content.

        Returns:
            List of changelog entries.
        """
        entries = []

        # Split by version headers (## [version] - date)
        pattern = r"##\s*\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})"
        matches = list(re.finditer(pattern, content))

        for i, match in enumerate(matches):
            version = match.group(1)
            date = match.group(2)

            # Get content until next version or end
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
            version_content = content[start:end].strip()

            # Convert markdown to HTML (simple conversion)
            html_content = self._markdown_to_html(version_content)

            entries.append(
                {
                    "version": version,
                    "date": date,
                    "content": html_content,
                }
            )

        return entries

    def _markdown_to_html(self, markdown: str) -> str:
        """Simple markdown to HTML conversion.

        Args:
            markdown: Markdown content.

        Returns:
            HTML content.
        """
        html = markdown

        # Headers
        html = re.sub(r"^###\s+(.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
        html = re.sub(r"^##\s+(.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)

        # Lists
        html = re.sub(r"^\*\s+(.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
        html = re.sub(r"^-\s+(.+)$", r"<li>\1</li>", html, flags=re.MULTILINE)
        # Wrap consecutive list items in <ul>
        html = re.sub(r"(<li>.*?</li>)", r"<ul>\1</ul>", html, flags=re.DOTALL)

        # Bold
        html = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html)

        # Links
        html = re.sub(r"\[([^\]]+)\]\(([^\)]+)\)", r'<a href="\2">\1</a>', html)

        # Paragraphs
        lines = html.split("\n")
        paragraphs = []
        current_para = []

        for line in lines:
            line = line.strip()
            if not line:
                if current_para:
                    paragraphs.append("<p>" + " ".join(current_para) + "</p>")
                    current_para = []
            elif not line.startswith("<"):
                current_para.append(line)
            else:
                if current_para:
                    paragraphs.append("<p>" + " ".join(current_para) + "</p>")
                    current_para = []
                paragraphs.append(line)

        if current_para:
            paragraphs.append("<p>" + " ".join(current_para) + "</p>")

        return "\n".join(paragraphs)

    def _display_version(self, entry: Dict):
        """Display changelog entry for a version.

        Args:
            entry: Changelog entry dictionary.
        """
        html = f"""
        <h2>Version {entry['version']}</h2>
        <p><i>Released: {entry['date']}</i></p>
        <hr>
        {entry['content']}
        """

        self.content_browser.setHtml(html)

    def _on_version_changed(self, index: int):
        """Handle version selection change.

        Args:
            index: Selected index.
        """
        entry = self.version_combo.itemData(index)
        if entry:
            self._display_version(entry)
