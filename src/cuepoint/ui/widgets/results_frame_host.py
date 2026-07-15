"""Centered results panel with 80vw cap and optional outer resize (Rollout Phase C)."""

from __future__ import annotations

from typing import Optional, Tuple

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QMouseEvent, QPainter, QPen
from PySide6.QtWidgets import QFrame, QHBoxLayout, QScrollArea, QSizePolicy, QVBoxLayout, QWidget

from cuepoint.ui.widgets.results_frame_layout import (
    clamp_frame_height,
    clamp_frame_width,
    clear_frame_size,
    get_frame_max_width,
    load_frame_size,
    save_frame_size,
)


class _FrameResizeGrip(QWidget):
    """Bottom-right corner grip — drag to resize, double-click to reset."""

    def __init__(self, host: "ResultsFrameHost") -> None:
        super().__init__(host)
        self._host = host
        self._drag_origin: Optional[Tuple[int, int]] = None
        self._start_size: Optional[Tuple[int, int]] = None
        self.setFixedSize(18, 18)
        self.setCursor(Qt.SizeFDiagCursor)
        self.setToolTip("Drag to resize panel. Double-click to reset size.")
        self.setAccessibleName("Resize results panel")

    def paintEvent(self, event) -> None:  # noqa: N802
        super().paintEvent(event)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)
        pen = QPen(self.palette().color(self.foregroundRole()))
        pen.setWidth(1)
        painter.setPen(pen)
        for offset in (4, 8, 12):
            painter.drawLine(offset, self.height() - 4, self.width() - 4, self.height() - offset)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.LeftButton:
            self._drag_origin = (event.globalPosition().toPoint().x(), event.globalPosition().toPoint().y())
            self._start_size = self._host.current_frame_size()
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if (
            self._drag_origin is not None
            and self._start_size is not None
            and event.buttons() & Qt.LeftButton
        ):
            gx = event.globalPosition().toPoint().x()
            gy = event.globalPosition().toPoint().y()
            dx = gx - self._drag_origin[0]
            dy = gy - self._drag_origin[1]
            self._host.resize_frame_to(
                self._start_size[0] + dx,
                self._start_size[1] + dy,
            )
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        self._drag_origin = None
        self._start_size = None
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:  # noqa: N802
        if event.button() == Qt.LeftButton:
            self._host.reset_frame_size()
        super().mouseDoubleClickEvent(event)


class ResultsFrameHost(QWidget):
    """Centers results content and caps width at 80% of the window."""

    sized_changed = Signal(bool)

    def __init__(self, content: QWidget, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._content = content
        stored_w, stored_h = load_frame_size()
        self._frame_width: Optional[int] = stored_w
        self._frame_height: Optional[int] = stored_h
        self._sized = stored_w is not None or stored_h is not None

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        outer.addStretch(1)

        self._frame = QFrame()
        self._frame.setObjectName("resultsFrame")
        self._frame.setFrameShape(QFrame.StyledPanel)
        self._frame.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Expanding)

        frame_layout = QVBoxLayout(self._frame)
        frame_layout.setContentsMargins(4, 4, 4, 4)
        frame_layout.setSpacing(0)
        frame_layout.addWidget(content, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 0, 0, 0)
        grip_row.addStretch(1)
        grip_row.addWidget(_FrameResizeGrip(self), 0, Qt.AlignRight | Qt.AlignBottom)
        frame_layout.addLayout(grip_row)

        outer.addWidget(self._frame, 0, Qt.AlignHCenter)
        outer.addStretch(1)

        self._apply_frame_constraints()

    def is_sized(self) -> bool:
        return self._sized

    def current_frame_size(self) -> Tuple[int, int]:
        return self._frame.width(), self._frame.height()

    def resize_frame_to(self, width: int, height: int) -> None:
        viewport = self._viewport_width()
        clamped_w = clamp_frame_width(width, viewport)
        clamped_h = clamp_frame_height(height)
        self._frame_width = clamped_w
        self._frame_height = clamped_h
        self._sized = True
        self._apply_frame_constraints()
        save_frame_size(clamped_w, clamped_h)
        self.sized_changed.emit(True)

    def reset_frame_size(self) -> None:
        self._frame_width = None
        self._frame_height = None
        self._sized = False
        clear_frame_size()
        self._apply_frame_constraints()
        self.sized_changed.emit(False)

    def resizeEvent(self, event) -> None:  # noqa: N802
        super().resizeEvent(event)
        self._apply_frame_constraints()

    def _viewport_width(self) -> int:
        window = self.window()
        if window is not None:
            return max(window.width(), 320)
        return max(self.width(), 320)

    def _apply_frame_constraints(self) -> None:
        viewport = self._viewport_width()
        max_w = get_frame_max_width(viewport)

        if not self._sized:
            self._frame.setMinimumSize(0, 0)
            self._frame.setMaximumWidth(max_w)
            self._frame.setMaximumHeight(16777215)
            self._frame.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
            self.setMinimumWidth(0)
        else:
            width = clamp_frame_width(self._frame_width or max_w, viewport)
            height = clamp_frame_height(self._frame_height or 480)
            self._frame.setFixedSize(width, height)
            self.setMinimumWidth(width)

        self._update_parent_scroll_policy()

    def _update_parent_scroll_policy(self) -> None:
        scroll = self._find_scroll_area()
        if scroll is None:
            return
        needs_horizontal = self._sized and self._frame.width() > scroll.viewport().width()
        scroll.setHorizontalScrollBarPolicy(
            Qt.ScrollBarAsNeeded if needs_horizontal else Qt.ScrollBarAlwaysOff
        )

    def _find_scroll_area(self) -> Optional[QScrollArea]:
        parent = self.parentWidget()
        while parent is not None:
            if isinstance(parent, QScrollArea):
                return parent
            parent = parent.parentWidget()
        return None
