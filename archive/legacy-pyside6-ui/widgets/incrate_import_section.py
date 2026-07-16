"""inCrate Import section: XML path, Browse, Import button, progress, stats (Phase 5)."""

from typing import Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class IncrateImportSection(QWidget):
    """Import section: path, Browse, Import, Reset database, progress label, stats label."""

    import_done = Signal(dict)  # result from import_from_xml
    import_progress = Signal(str)  # status text
    reset_requested = (
        Signal()
    )  # user wants to clear inventory so they can import another collection

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        group = QGroupBox("Import")
        group_layout = QVBoxLayout(group)

        path_row = QHBoxLayout()
        self.path_edit = QLineEdit()
        self.path_edit.setPlaceholderText("Rekordbox XML export path...")
        self.path_edit.setClearButtonEnabled(True)
        path_row.addWidget(self.path_edit)
        self.browse_btn = QPushButton("Browse")
        self.browse_btn.setObjectName("incrate_browse")
        self.browse_btn.clicked.connect(self._on_browse)
        path_row.addWidget(self.browse_btn)
        group_layout.addLayout(path_row)

        btn_row = QHBoxLayout()
        self.import_btn = QPushButton("Import")
        self.import_btn.setObjectName("incrate_import")
        btn_row.addWidget(self.import_btn)
        self.reset_db_btn = QPushButton("Reset database")
        self.reset_db_btn.setObjectName("incrate_reset_db")
        self.reset_db_btn.setToolTip(
            "Clear all inventory so you can import a different collection.xml"
        )
        self.reset_db_btn.clicked.connect(self._on_reset_db_clicked)
        btn_row.addWidget(self.reset_db_btn)
        btn_row.addStretch()
        group_layout.addLayout(btn_row)

        self.progress_label = QLabel("")
        self.progress_label.setStyleSheet("color: #888; font-size: 12px;")
        group_layout.addWidget(self.progress_label)

        self.progress_bar = QProgressBar()
        self.progress_bar.setMinimum(0)
        self.progress_bar.setMaximum(100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setVisible(False)
        group_layout.addWidget(self.progress_bar)

        self.stats_label = QLabel("No inventory yet. Import Rekordbox XML first.")
        self.stats_label.setStyleSheet("color: #666; font-size: 12px;")
        group_layout.addWidget(self.stats_label)

        layout.addWidget(group)

    def _on_reset_db_clicked(self) -> None:
        from PySide6.QtWidgets import QMessageBox

        reply = QMessageBox.question(
            self,
            "Reset inventory",
            "Clear all inventory? You can then import a different collection.xml.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            self.reset_requested.emit()

    def _on_browse(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Rekordbox XML",
            "",
            "XML files (*.xml);;All files (*)",
        )
        if path:
            self.path_edit.setText(path)

    def get_xml_path(self) -> str:
        return (self.path_edit.text() or "").strip()

    def set_importing(self, importing: bool) -> None:
        self.import_btn.setEnabled(not importing)
        self.browse_btn.setEnabled(not importing)
        self.reset_db_btn.setEnabled(not importing)

    def set_progress(self, text: str) -> None:
        self.progress_label.setText(text)

    def show_progress_bar(self, visible: bool = True) -> None:
        self.progress_bar.setVisible(visible)
        if visible:
            self.progress_bar.setMaximum(0)  # indeterminate
            self.progress_bar.setValue(0)

    def set_progress_bar_range(self, current: int, total: int) -> None:
        """Set determinate progress (e.g. Enriching N/M). total 0 = indeterminate."""
        if total <= 0:
            self.progress_bar.setMaximum(0)
            self.progress_bar.setValue(0)
            return
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(total)
        self.progress_bar.setValue(min(current, total))
        self.progress_bar.setFormat("%v / %m")

    def hide_progress_bar(self) -> None:
        self.progress_bar.setVisible(False)

    def set_stats(self, total: int, artists: int, labels: int) -> None:
        if total == 0:
            self.stats_label.setText("No inventory yet. Import Rekordbox XML first.")
        else:
            self.stats_label.setText(
                f"{total} tracks, {artists} artists, {labels} labels"
            )

    def show_error(self, message: str) -> None:
        self.stats_label.setText(message)
        self.stats_label.setStyleSheet("color: #c62828; font-size: 12px;")
