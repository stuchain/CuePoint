#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Playlist Selector Module - Trigger + popup with search and tree

Single-line trigger shows current path; clicking opens a floating popup with
search bar and hierarchical tree (folders expandable, playlists as leaves).
"""

from typing import Any, Dict, List

from PySide6.QtCore import Qt, QPoint, Signal
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QStyle,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from cuepoint.data.rekordbox import parse_playlist_tree, playlist_path_for_display
from cuepoint.models.playlist import Playlist
from cuepoint.ui.strings import EmptyState, TooltipCopy


# Role for storing playlist path on leaf items
_PATH_ROLE = Qt.ItemDataRole.UserRole


class _PlaylistPopup(QFrame):
    """Floating popup with search and tree. Closes on focus loss (Popup flag)."""

    def __init__(self, parent: QWidget, tree_roots: List[Dict[str, Any]]) -> None:
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.Popup)
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setMinimumWidth(320)
        self.setMinimumHeight(200)
        self.setMaximumHeight(400)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(6)

        self._search = QLineEdit()
        self._search.setPlaceholderText("Search playlists...")
        self._search.setClearButtonEnabled(True)
        self._search.setStyleSheet(
            "QLineEdit { color: #e0e0e0; font-size: 11px; }"
            " QLineEdit::placeholder { color: #888; }"
        )
        self._search.textChanged.connect(self._on_search_changed)
        layout.addWidget(self._search)

        self._tree = QTreeWidget()
        self._tree.setHeaderHidden(True)
        self._tree.setStyleSheet("font-size: 11px; color: #e0e0e0;")
        self._tree.setIndentation(16)
        self._tree.itemDoubleClicked.connect(self._on_item_double_clicked)
        layout.addWidget(self._tree, 1)

        self._tree_roots = tree_roots
        self._path_to_item: Dict[str, QTreeWidgetItem] = {}
        self._build_tree()
        self._filter_text = ""

    def _build_tree(self) -> None:
        self._tree.clear()
        self._path_to_item.clear()
        self._add_nodes(self._tree_roots, None)

    def _add_nodes(
        self, nodes: List[Dict[str, Any]], parent: QTreeWidgetItem | None
    ) -> None:
        for node in nodes:
            name = node.get("name", "Unnamed")
            path = node.get("path", name)
            node_type = node.get("type", "playlist")
            if node_type == "playlist":
                item = QTreeWidgetItem([f"{name} ({node.get('track_count', 0)})"])
                item.setData(0, _PATH_ROLE, path)
                self._path_to_item[path] = item
                if parent:
                    parent.addChild(item)
                else:
                    self._tree.addTopLevelItem(item)
            else:
                # Skip ROOT folder: show its children as top-level so we don't display "ROOT"
                if name.upper() == "ROOT":
                    self._add_nodes(node.get("children", []), parent)
                    continue
                folder_item = QTreeWidgetItem([name])
                if parent:
                    parent.addChild(folder_item)
                else:
                    self._tree.addTopLevelItem(folder_item)
                self._add_nodes(node.get("children", []), folder_item)

    def _on_search_changed(self, text: str) -> None:
        self._filter_text = (text or "").strip().lower()
        self._apply_filter()

    def _apply_filter(self) -> None:
        if not self._filter_text:
            self._set_all_visible_collapsed()
            return
        self._filter_visible()

    def _set_all_visible_collapsed(self) -> None:
        def _walk(item: QTreeWidgetItem) -> None:
            item.setHidden(False)
            for i in range(item.childCount()):
                _walk(item.child(i))
            if item.childCount() > 0:
                item.setExpanded(False)
        for i in range(self._tree.topLevelItemCount()):
            _walk(self._tree.topLevelItem(i))

    def _filter_visible(self) -> None:
        def _filter(item: QTreeWidgetItem) -> bool:
            path = item.data(0, _PATH_ROLE)
            name = item.text(0)
            is_leaf = path is not None
            match = (
                self._filter_text in (path or "").lower()
                or self._filter_text in name.lower()
            )
            if is_leaf:
                item.setHidden(not match)
                return match
            any_child = False
            for i in range(item.childCount()):
                if _filter(item.child(i)):
                    any_child = True
            item.setHidden(not any_child)
            if any_child:
                item.setExpanded(True)
            return any_child
        for i in range(self._tree.topLevelItemCount()):
            _filter(self._tree.topLevelItem(i))

    def _on_item_double_clicked(self, item: QTreeWidgetItem, _col: int) -> None:
        path = item.data(0, _PATH_ROLE)
        if path is not None:
            if hasattr(self.parent(), "_on_popup_select"):
                self.parent()._on_popup_select(path)
            self.close()

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            cur = self._tree.currentItem()
            if cur:
                path = cur.data(0, _PATH_ROLE)
                if path is not None:
                    if hasattr(self.parent(), "_on_popup_select"):
                        self.parent()._on_popup_select(path)
                    self.close()
                    return
        if event.key() == Qt.Key.Key_Escape:
            self.close()
            return
        super().keyPressEvent(event)


class PlaylistSelector(QWidget):
    """Single-line trigger + popup with search and hierarchical tree."""

    playlist_selected = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.playlists: Dict[str, Playlist] = {}
        self._tree_roots: List[Dict[str, Any]] = []
        self._current_path = ""
        self._popup: _PlaylistPopup | None = None
        self.init_ui()

    def init_ui(self) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        self._trigger_edit = QLineEdit()
        self._trigger_edit.setReadOnly(True)
        self._trigger_edit.setPlaceholderText(EmptyState.NO_PLAYLIST_TITLE)
        self._trigger_edit.setToolTip(TooltipCopy.PLAYLIST)
        self._trigger_edit.setAccessibleName("Playlist selector")
        self._trigger_edit.setAccessibleDescription(
            "Select a playlist from the loaded Rekordbox collection XML"
        )
        self._trigger_edit.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self._trigger_edit.setStyleSheet(
            "QLineEdit { color: #e0e0e0; font-size: 11px; background: transparent; }"
            " QLineEdit::placeholder { color: #888; }"
        )
        self._trigger_edit.mousePressEvent = self._on_trigger_clicked
        layout.addWidget(self._trigger_edit, 1)

        self._arrow_btn = QPushButton()
        self._arrow_btn.setFixedWidth(28)
        self._arrow_btn.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self._arrow_btn.setStyleSheet(
            "QPushButton { border: none; background: transparent; }"
            " QPushButton:hover { background-color: rgba(255,255,255,0.1); border-radius: 4px; }"
        )
        style = self.style()
        if style:
            icon = style.standardIcon(QStyle.StandardPixmap.SP_ArrowDown)
            self._arrow_btn.setIcon(icon)
            self._arrow_btn.setIconSize(self._arrow_btn.iconSize())
        else:
            self._arrow_btn.setText("\u25BC")
        self._arrow_btn.clicked.connect(self._open_popup)
        layout.addWidget(self._arrow_btn)

        self._trigger_edit.setEnabled(False)
        self._arrow_btn.setEnabled(False)

    def _on_trigger_clicked(self, event) -> None:
        self._open_popup()
        event.accept()

    def _open_popup(self) -> None:
        if not self._tree_roots and not self.playlists:
            return
        self._popup = _PlaylistPopup(self, self._tree_roots)
        self._popup.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)
        # Match popup width to the playlist box (trigger widget) width
        self._popup.setFixedWidth(self.width())
        pos = self.mapToGlobal(QPoint(0, self.height()))
        self._popup.move(pos)
        self._popup.show()
        self._popup._search.setFocus()

    def _on_popup_select(self, path: str) -> None:
        self._current_path = path
        self._trigger_edit.setText(playlist_path_for_display(path))
        self._trigger_edit.setPlaceholderText("")
        self.playlist_selected.emit(path)

    def load_xml_file(self, xml_path: str) -> None:
        try:
            self._tree_roots, self.playlists = parse_playlist_tree(xml_path)
            self._current_path = ""
            self._trigger_edit.clear()
            if self._tree_roots or self.playlists:
                self._trigger_edit.setEnabled(True)
                self._arrow_btn.setEnabled(True)
                self._trigger_edit.setPlaceholderText("")
            else:
                self._trigger_edit.setEnabled(False)
                self._arrow_btn.setEnabled(False)
                self._trigger_edit.setPlaceholderText(EmptyState.NO_PLAYLISTS_IN_XML)
        except FileNotFoundError:
            self._tree_roots = []
            self.playlists = {}
            self._trigger_edit.clear()
            self._trigger_edit.setEnabled(False)
            self._arrow_btn.setEnabled(False)
            self._trigger_edit.setPlaceholderText(EmptyState.XML_NOT_FOUND)
            raise
        except Exception:
            self._tree_roots = []
            self.playlists = {}
            self._trigger_edit.clear()
            self._trigger_edit.setEnabled(False)
            self._arrow_btn.setEnabled(False)
            self._trigger_edit.setPlaceholderText(EmptyState.ERROR_LOADING_XML)
            raise

    def get_tree_roots(self) -> List[Dict[str, Any]]:
        """Return the tree roots (folder/playlist hierarchy) for use by batch mode."""
        return self._tree_roots

    def get_selected_playlist(self) -> str:
        return self._current_path or self._trigger_edit.text()

    def set_selected_playlist(self, playlist_key: str) -> None:
        if not playlist_key or playlist_key not in self.playlists:
            return
        self._current_path = playlist_key
        self._trigger_edit.setText(playlist_path_for_display(playlist_key))
        self._trigger_edit.setPlaceholderText("")

    def get_playlist_track_count(self, playlist_key: str) -> int:
        if playlist_key in self.playlists:
            return self.playlists[playlist_key].get_track_count()
        return 0

    def clear(self) -> None:
        self._tree_roots = []
        self.playlists = {}
        self._current_path = ""
        self._trigger_edit.clear()
        self._trigger_edit.setEnabled(False)
        self._arrow_btn.setEnabled(False)
        self._trigger_edit.setPlaceholderText(EmptyState.NO_XML_LOADED)
