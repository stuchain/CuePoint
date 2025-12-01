# Step 6.5: Redesign Results View

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 6.2 (Implement Theme System), Step 6.3 (Redesign Main Window)

---

## Goal

Redesign the results view to be visually appealing, easy to read, and provide clear visual feedback about match status, confidence levels, and track metadata. Support both table and card views.

---

## Success Criteria

- [ ] Results table redesigned with pixel art style
- [ ] Visual indicators for match status (icons, colors)
- [ ] Confidence badges with color coding
- [ ] Card view option implemented
- [ ] Improved readability and typography
- [ ] Quick actions (view, edit) available
- [ ] Sorting and filtering preserved
- [ ] Performance maintained
- [ ] Responsive layout

---

## Analytical Design

### Results View Layout

```
Results View
├── Toolbar
│   ├── View Toggle (Table/Card)
│   ├── Filter Options
│   ├── Sort Options
│   └── Export Selected
├── Results Display
│   ├── Table View (Default)
│   │   ├── Status Column (Icons)
│   │   ├── Track Name
│   │   ├── Artist
│   │   ├── Match Info
│   │   ├── Confidence Badge
│   │   └── Actions
│   └── Card View
│       └── Card Grid with Track Info
└── Status Bar
    └── Match Statistics
```

### Implementation

```python
# src/cuepoint/ui/widgets/results_view_pixel.py
"""
Redesigned results view with pixel art styling.
"""

from typing import List, Optional, Dict, Any
from enum import Enum

from PySide6.QtCore import Qt, Signal, QSize
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QTableWidget, QTableWidgetItem, QHeaderView,
    QPushButton, QComboBox, QToolBar, QStatusBar,
    QFrame, QGridLayout, QScrollArea
)
from PySide6.QtGui import QIcon, QColor, QFont

from cuepoint.models.result import TrackResult
from cuepoint.ui.theme.theme_manager import ThemeManager
from cuepoint.ui.widgets.pixel_widgets import PixelButton, PixelBadge, PixelCard


class ViewMode(Enum):
    """Results view modes."""
    TABLE = "table"
    CARD = "card"


class ResultsViewPixel(QWidget):
    """Redesigned results view with pixel art styling."""
    
    track_selected = Signal(TrackResult)
    track_edited = Signal(TrackResult)
    export_requested = Signal()
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        
        self.theme_manager = ThemeManager()
        self.results: List[TrackResult] = []
        self.view_mode = ViewMode.TABLE
        
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI."""
        layout = QVBoxLayout(self)
        layout.setSpacing(0)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Toolbar
        self.create_toolbar(layout)
        
        # Results display
        self.create_results_display(layout)
        
        # Status bar
        self.create_status_bar(layout)
    
    def create_toolbar(self, parent_layout: QVBoxLayout):
        """Create toolbar with view options."""
        toolbar = QToolBar()
        toolbar.setMovable(False)
        
        # View mode toggle
        view_group = QWidget()
        view_layout = QHBoxLayout(view_group)
        view_layout.setContentsMargins(0, 0, 0, 0)
        
        table_btn = QPushButton("📊 Table")
        table_btn.setCheckable(True)
        table_btn.setChecked(True)
        table_btn.clicked.connect(lambda: self.set_view_mode(ViewMode.TABLE))
        
        card_btn = QPushButton("🃏 Cards")
        card_btn.setCheckable(True)
        card_btn.clicked.connect(lambda: self.set_view_mode(ViewMode.CARD))
        
        view_layout.addWidget(table_btn)
        view_layout.addWidget(card_btn)
        toolbar.addWidget(view_group)
        
        toolbar.addSeparator()
        
        # Filter
        filter_label = QLabel("Filter:")
        filter_combo = QComboBox()
        filter_combo.addItems(["All", "Matched", "Unmatched", "High Confidence"])
        filter_combo.currentTextChanged.connect(self.filter_results)
        toolbar.addWidget(filter_label)
        toolbar.addWidget(filter_combo)
        
        toolbar.addSeparator()
        
        # Sort
        sort_label = QLabel("Sort:")
        sort_combo = QComboBox()
        sort_combo.addItems(["Track Name", "Artist", "Confidence", "Status"])
        sort_combo.currentTextChanged.connect(self.sort_results)
        toolbar.addWidget(sort_label)
        toolbar.addWidget(sort_combo)
        
        toolbar.addSeparator()
        
        # Export
        export_btn = PixelButton("Export Selected", class_name="secondary")
        export_btn.clicked.connect(self.export_requested.emit)
        toolbar.addWidget(export_btn)
        
        parent_layout.addWidget(toolbar)
    
    def create_results_display(self, parent_layout: QVBoxLayout):
        """Create results display area."""
        # Stacked widget for table/card views
        self.results_stack = QWidget()
        self.results_layout = QVBoxLayout(self.results_stack)
        self.results_layout.setContentsMargins(0, 0, 0, 0)
        
        # Table view
        self.create_table_view()
        
        # Card view
        self.create_card_view()
        
        parent_layout.addWidget(self.results_stack)
    
    def create_table_view(self):
        """Create table view."""
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels([
            "Status", "Track", "Artist", "Match", "BPM", "Key", "Actions"
        ])
        
        # Style table
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        
        # Set column widths
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeToContents)  # Status
        header.setSectionResizeMode(1, QHeaderView.Stretch)  # Track
        header.setSectionResizeMode(2, QHeaderView.Stretch)  # Artist
        header.setSectionResizeMode(3, QHeaderView.ResizeToContents)  # Match
        header.setSectionResizeMode(4, QHeaderView.ResizeToContents)  # BPM
        header.setSectionResizeMode(5, QHeaderView.ResizeToContents)  # Key
        header.setSectionResizeMode(6, QHeaderView.ResizeToContents)  # Actions
        
        self.results_layout.addWidget(self.table)
    
    def create_card_view(self):
        """Create card view."""
        self.card_scroll = QScrollArea()
        self.card_scroll.setWidgetResizable(True)
        self.card_scroll.setVisible(False)
        
        self.card_container = QWidget()
        self.card_layout = QGridLayout(self.card_container)
        self.card_layout.setSpacing(16)
        
        self.card_scroll.setWidget(self.card_container)
        self.results_layout.addWidget(self.card_scroll)
    
    def create_status_bar(self, parent_layout: QVBoxLayout):
        """Create status bar."""
        status_frame = QFrame()
        status_layout = QHBoxLayout(status_frame)
        status_layout.setContentsMargins(8, 4, 8, 4)
        
        self.status_label = QLabel("No results")
        status_layout.addWidget(self.status_label)
        status_layout.addStretch()
        
        parent_layout.addWidget(status_frame)
    
    def set_results(self, results: List[TrackResult]):
        """Set results to display."""
        self.results = results
        self.update_display()
        self.update_status()
    
    def update_display(self):
        """Update display based on current view mode."""
        if self.view_mode == ViewMode.TABLE:
            self.update_table_view()
        else:
            self.update_card_view()
    
    def update_table_view(self):
        """Update table view with results."""
        self.table.setRowCount(len(self.results))
        
        for row, result in enumerate(self.results):
            # Status icon
            status_item = self.create_status_item(result)
            self.table.setItem(row, 0, status_item)
            
            # Track name
            track_item = QTableWidgetItem(result.track_name or "Unknown")
            self.table.setItem(row, 1, track_item)
            
            # Artist
            artist_item = QTableWidgetItem(result.artist or "Unknown")
            self.table.setItem(row, 2, artist_item)
            
            # Match info
            if result.matched:
                match_text = f"{result.match_title} - {result.match_artist}"
            else:
                match_text = "No match"
            match_item = QTableWidgetItem(match_text)
            self.table.setItem(row, 3, match_item)
            
            # BPM
            bpm_text = str(result.bpm) if result.bpm else "—"
            bpm_item = QTableWidgetItem(bpm_text)
            bpm_item.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(row, 4, bpm_item)
            
            # Key
            key_text = result.key or "—"
            key_item = QTableWidgetItem(key_text)
            key_item.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(row, 5, key_item)
            
            # Actions
            actions_widget = self.create_actions_widget(result)
            self.table.setCellWidget(row, 6, actions_widget)
        
        # Show table, hide cards
        self.table.setVisible(True)
        self.card_scroll.setVisible(False)
    
    def update_card_view(self):
        """Update card view with results."""
        # Clear existing cards
        for i in reversed(range(self.card_layout.count())):
            self.card_layout.itemAt(i).widget().setParent(None)
        
        # Create cards
        for idx, result in enumerate(self.results):
            card = self.create_result_card(result)
            row = idx // 3
            col = idx % 3
            self.card_layout.addWidget(card, row, col)
        
        # Show cards, hide table
        self.table.setVisible(False)
        self.card_scroll.setVisible(True)
    
    def create_status_item(self, result: TrackResult) -> QTableWidgetItem:
        """Create status icon item."""
        item = QTableWidgetItem()
        
        if result.matched:
            icon = self.theme_manager.get_icon("check", "16x16")
            item.setIcon(icon)
            item.setToolTip("Matched")
            item.setBackground(QColor(self.theme_manager.get_color("status", "success")))
        else:
            icon = self.theme_manager.get_icon("cross", "16x16")
            item.setIcon(icon)
            item.setToolTip("No match")
            item.setBackground(QColor(self.theme_manager.get_color("status", "error")))
        
        item.setTextAlignment(Qt.AlignCenter)
        return item
    
    def create_actions_widget(self, result: TrackResult) -> QWidget:
        """Create actions widget for a result."""
        widget = QWidget()
        layout = QHBoxLayout(widget)
        layout.setContentsMargins(4, 2, 4, 2)
        layout.setSpacing(4)
        
        view_btn = QPushButton("👁️")
        view_btn.setToolTip("View Details")
        view_btn.setFixedSize(24, 24)
        view_btn.clicked.connect(lambda: self.track_selected.emit(result))
        
        edit_btn = QPushButton("✏️")
        edit_btn.setToolTip("Edit")
        edit_btn.setFixedSize(24, 24)
        edit_btn.clicked.connect(lambda: self.track_edited.emit(result))
        
        layout.addWidget(view_btn)
        layout.addWidget(edit_btn)
        layout.addStretch()
        
        return widget
    
    def create_result_card(self, result: TrackResult) -> PixelCard:
        """Create a result card."""
        card = PixelCard()
        layout = QVBoxLayout(card)
        layout.setSpacing(8)
        
        # Status badge
        status_badge = PixelBadge(
            "✓ Matched" if result.matched else "✗ No Match",
            "success" if result.matched else "error"
        )
        layout.addWidget(status_badge)
        
        # Track info
        track_label = QLabel(result.track_name or "Unknown")
        track_label.setStyleSheet("font-weight: bold; font-size: 16px;")
        layout.addWidget(track_label)
        
        artist_label = QLabel(result.artist or "Unknown")
        artist_label.setStyleSheet("color: #666;")
        layout.addWidget(artist_label)
        
        # Match info
        if result.matched:
            match_label = QLabel(f"→ {result.match_title}")
            match_label.setStyleSheet("color: #4A90E2;")
            layout.addWidget(match_label)
        
        # Metadata
        metadata_layout = QHBoxLayout()
        
        if result.bpm:
            bpm_label = QLabel(f"🎵 {result.bpm} BPM")
            metadata_layout.addWidget(bpm_label)
        
        if result.key:
            key_label = QLabel(f"🎹 {result.key}")
            metadata_layout.addWidget(key_label)
        
        layout.addLayout(metadata_layout)
        
        # Confidence badge
        if result.confidence:
            confidence_badge = PixelBadge(
                f"{result.confidence:.0%}",
                self.get_confidence_color(result.confidence)
            )
            layout.addWidget(confidence_badge)
        
        # Actions
        actions_layout = QHBoxLayout()
        view_btn = PixelButton("View", class_name="secondary")
        view_btn.clicked.connect(lambda: self.track_selected.emit(result))
        actions_layout.addWidget(view_btn)
        
        layout.addLayout(actions_layout)
        
        return card
    
    def get_confidence_color(self, confidence: float) -> str:
        """Get color class for confidence level."""
        if confidence >= 0.8:
            return "success"
        elif confidence >= 0.5:
            return "warning"
        else:
            return "error"
    
    def set_view_mode(self, mode: ViewMode):
        """Set view mode."""
        self.view_mode = mode
        self.update_display()
    
    def filter_results(self, filter_text: str):
        """Filter results."""
        # Implementation for filtering
        pass
    
    def sort_results(self, sort_by: str):
        """Sort results."""
        # Implementation for sorting
        pass
    
    def update_status(self):
        """Update status bar."""
        total = len(self.results)
        matched = sum(1 for r in self.results if r.matched)
        unmatched = total - matched
        
        status_text = f"Total: {total} | Matched: {matched} | Unmatched: {unmatched}"
        self.status_label.setText(status_text)
```

---

## File Structure

```
src/cuepoint/ui/widgets/
├── results_view_pixel.py      # New pixel-styled results view
└── results_view.py            # Existing (keep for compatibility)
```

---

## Testing Requirements

### Functional Testing
- [ ] Results display correctly in table view
- [ ] Results display correctly in card view
- [ ] View mode switching works
- [ ] Sorting works
- [ ] Filtering works
- [ ] Status icons display correctly
- [ ] Confidence badges display correctly
- [ ] Actions work

### Visual Testing
- [ ] Table is readable
- [ ] Cards are well-formatted
- [ ] Colors are appropriate
- [ ] Icons are clear
- [ ] Layout is responsive

---

## Implementation Checklist

- [ ] Create ResultsViewPixel class
- [ ] Implement table view
- [ ] Implement card view
- [ ] Add status indicators
- [ ] Add confidence badges
- [ ] Add quick actions
- [ ] Implement view mode switching
- [ ] Add sorting
- [ ] Add filtering
- [ ] Update status bar
- [ ] Test with various result sets
- [ ] Verify performance

---

## Dependencies

- **Step 6.2**: Implement Theme System
- **Step 6.3**: Redesign Main Window
- **TrackResult Model**: For data structure
- **Theme Manager**: For icons and colors

---

## Notes

- **Performance**: Use virtual scrolling for large result sets
- **Accessibility**: Ensure keyboard navigation works
- **Responsive**: Cards should adapt to window size
- **Consistency**: Match pixel art style throughout

---

## Next Steps

After completing this step:
1. Proceed to Step 6.6: Create Onboarding & Tutorial System
2. Tutorial will guide users through results view
3. Test complete user journey

