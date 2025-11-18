# Visual Analytics Dashboard (Future Feature)

**Status**: 📝 Future Consideration  
**Priority**: 🚀 Low Priority (Only if users request analytics/visualization)  
**Estimated Duration**: 3-4 days  
**Dependencies**: Phase 2 (results view), Phase 3 (performance monitoring)

## Goal
Create a visual analytics dashboard with charts and graphs to help users understand their matching patterns, success rates, and track statistics.

## Success Criteria
- [ ] Charts and graphs displayed
- [ ] Statistics calculated correctly
- [ ] Dashboard updates in real-time
- [ ] Export charts as images
- [ ] Performance acceptable
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: Text-based statistics, performance dashboard (Phase 3)
- **Limitations**: No visual charts, limited analytics
- **Opportunity**: Visual insights into matching patterns
- **Risk**: Requires charting library, may impact performance

### Dashboard Design
- **Match Rate Chart**: Success rate over time
- **Genre Distribution**: Pie/bar chart of genres
- **Year Distribution**: Histogram of track years
- **BPM Distribution**: Histogram of BPMs
- **Artist Statistics**: Top artists, labels
- **Performance Trends**: Processing time trends

### Performance Considerations (Phase 3 Integration)
- **Chart Rendering**: Track chart generation time
- **Data Aggregation**: Efficient statistics calculation
- **Metrics to Track**:
  - Dashboard load time
  - Chart rendering time
  - Data aggregation time

---

## Implementation Steps

### Substep 4.10.1: Add Charting Library (1 hour)
**File**: `requirements.txt` (MODIFY)

**What to add:**

```txt
matplotlib>=3.5.0
```

**Implementation Checklist**:
- [ ] Add matplotlib to requirements
- [ ] Test library import

---

### Substep 4.10.2: Create Analytics Dashboard Widget (2-3 days)
**File**: `SRC/gui/analytics_view.py` (NEW)

**What to implement:**

```python
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg
from matplotlib.figure import Figure
import matplotlib.pyplot as plt

class AnalyticsView(QWidget):
    """Visual analytics dashboard"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.init_ui()
    
    def init_ui(self):
        """Initialize dashboard UI"""
        layout = QVBoxLayout(self)
        
        # Create figure and canvas
        self.figure = Figure(figsize=(12, 8))
        self.canvas = FigureCanvasQTAgg(self.figure)
        layout.addWidget(self.canvas)
        
        # Update button
        update_button = QPushButton("Update Charts")
        update_button.clicked.connect(self.update_charts)
        layout.addWidget(update_button)
    
    def update_charts(self):
        """Update all charts with current data"""
        self.figure.clear()
        
        # Create subplots
        ax1 = self.figure.add_subplot(2, 2, 1)
        ax2 = self.figure.add_subplot(2, 2, 2)
        ax3 = self.figure.add_subplot(2, 2, 3)
        ax4 = self.figure.add_subplot(2, 2, 4)
        
        # Match rate chart
        self._plot_match_rate(ax1)
        
        # Genre distribution
        self._plot_genre_distribution(ax2)
        
        # Year distribution
        self._plot_year_distribution(ax3)
        
        # BPM distribution
        self._plot_bpm_distribution(ax4)
        
        self.figure.tight_layout()
        self.canvas.draw()
    
    def _plot_match_rate(self, ax):
        """Plot match rate chart"""
        # Implementation
        pass
    
    def _plot_genre_distribution(self, ax):
        """Plot genre distribution"""
        # Implementation
        pass
    
    def _plot_year_distribution(self, ax):
        """Plot year distribution"""
        # Implementation
        pass
    
    def _plot_bpm_distribution(self, ax):
        """Plot BPM distribution"""
        # Implementation
        pass
```

**Implementation Checklist**:
- [ ] Create analytics view widget
- [ ] Implement chart generation
- [ ] Add chart types
- [ ] Test chart rendering
- [ ] Add export functionality

---

### Substep 4.10.3: GUI Integration and Main Window Integration (1 day)
**Files**: `SRC/gui/main_window.py` (MODIFY), `SRC/gui/analytics_view.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.2 (main window exists), Substep 4.10.1 (charting library), Substep 4.10.2 (analytics widget)

**What to implement - EXACT STRUCTURE:**

#### Part A: Main Window Integration

**In `SRC/gui/main_window.py`:**

```python
from SRC.gui.analytics_view import AnalyticsView

class MainWindow(QMainWindow):
    """Main application window with analytics dashboard"""
    
    def __init__(self):
        super().__init__()
        # ... existing initialization ...
        self.analytics_view = None
        self.analytics_tab_index = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI with analytics tab"""
        # ... existing UI setup ...
        
        # Add Analytics tab (always visible, or based on config)
        self._add_analytics_tab()
    
    def _add_analytics_tab(self):
        """Add analytics tab to main window"""
        if self.analytics_view is None:
            from SRC.gui.analytics_view import AnalyticsView
            self.analytics_view = AnalyticsView()
            self.analytics_tab_index = self.tabs.addTab(self.analytics_view, "Analytics")
    
    def on_processing_complete(self, results):
        """Handle processing completion with analytics update"""
        # ... existing processing completion logic ...
        
        # Update analytics view
        if self.analytics_view:
            self.analytics_view.update_results(results)
            self.analytics_view.update_charts()
```

#### Part B: Enhanced Analytics View with Export

**In `SRC/gui/analytics_view.py`:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QComboBox, QGroupBox, QFileDialog, QMessageBox
)
from PySide6.QtCore import Qt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg
from matplotlib.figure import Figure
import matplotlib.pyplot as plt
from typing import List

class AnalyticsView(QWidget):
    """Visual analytics dashboard with export"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.results = []
        self.init_ui()
    
    def init_ui(self):
        """Initialize dashboard UI"""
        layout = QVBoxLayout(self)
        
        # Control panel
        control_panel = QHBoxLayout()
        
        # Chart type selector
        chart_type_label = QLabel("Chart Type:")
        self.chart_type_combo = QComboBox()
        self.chart_type_combo.addItems([
            "All Charts",
            "Match Rate",
            "Genre Distribution",
            "Year Distribution",
            "BPM Distribution",
            "Artist Statistics"
        ])
        self.chart_type_combo.currentTextChanged.connect(self.update_charts)
        control_panel.addWidget(chart_type_label)
        control_panel.addWidget(self.chart_type_combo)
        
        control_panel.addStretch()
        
        # Update button
        self.update_button = QPushButton("Update Charts")
        self.update_button.clicked.connect(self.update_charts)
        control_panel.addWidget(self.update_button)
        
        # Export button
        self.export_button = QPushButton("Export Chart")
        self.export_button.clicked.connect(self.export_chart)
        control_panel.addWidget(self.export_button)
        
        layout.addLayout(control_panel)
        
        # Create figure and canvas
        self.figure = Figure(figsize=(12, 8))
        self.canvas = FigureCanvasQTAgg(self.figure)
        layout.addWidget(self.canvas)
        
        # Status label
        self.status_label = QLabel("No data available. Process a playlist to see analytics.")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setStyleSheet("color: gray; font-style: italic;")
        layout.addWidget(self.status_label)
    
    def update_results(self, results: List):
        """Update results data"""
        self.results = results
        if results:
            self.status_label.setText(f"Displaying analytics for {len(results)} tracks")
        else:
            self.status_label.setText("No data available. Process a playlist to see analytics.")
    
    def update_charts(self):
        """Update all charts with current data"""
        if not self.results:
            self.figure.clear()
            self.canvas.draw()
            return
        
        self.figure.clear()
        
        chart_type = self.chart_type_combo.currentText()
        
        if chart_type == "All Charts":
            # Create 2x2 grid
            ax1 = self.figure.add_subplot(2, 2, 1)
            ax2 = self.figure.add_subplot(2, 2, 2)
            ax3 = self.figure.add_subplot(2, 2, 3)
            ax4 = self.figure.add_subplot(2, 2, 4)
            
            self._plot_match_rate(ax1)
            self._plot_genre_distribution(ax2)
            self._plot_year_distribution(ax3)
            self._plot_bpm_distribution(ax4)
        elif chart_type == "Match Rate":
            ax = self.figure.add_subplot(1, 1, 1)
            self._plot_match_rate(ax)
        elif chart_type == "Genre Distribution":
            ax = self.figure.add_subplot(1, 1, 1)
            self._plot_genre_distribution(ax)
        elif chart_type == "Year Distribution":
            ax = self.figure.add_subplot(1, 1, 1)
            self._plot_year_distribution(ax)
        elif chart_type == "BPM Distribution":
            ax = self.figure.add_subplot(1, 1, 1)
            self._plot_bpm_distribution(ax)
        elif chart_type == "Artist Statistics":
            ax = self.figure.add_subplot(1, 1, 1)
            self._plot_artist_statistics(ax)
        
        self.figure.tight_layout()
        self.canvas.draw()
    
    def export_chart(self):
        """Export current chart as image"""
        if not self.results:
            QMessageBox.warning(self, "No Data", "No data to export. Please process a playlist first.")
            return
        
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Chart",
            "",
            "PNG Images (*.png);;PDF Files (*.pdf);;SVG Files (*.svg);;All Files (*.*)"
        )
        
        if file_path:
            try:
                self.figure.savefig(file_path, dpi=300, bbox_inches='tight')
                QMessageBox.information(self, "Export Successful", f"Chart exported to:\n{file_path}")
            except Exception as e:
                QMessageBox.warning(self, "Export Failed", f"Failed to export chart:\n{str(e)}")
    
    def _plot_match_rate(self, ax):
        """Plot match rate chart"""
        matched = sum(1 for r in self.results if r.matched)
        unmatched = len(self.results) - matched
        
        if len(self.results) > 0:
            match_rate = (matched / len(self.results)) * 100
            ax.pie([matched, unmatched], labels=["Matched", "Unmatched"], autopct='%1.1f%%')
            ax.set_title(f"Match Rate: {match_rate:.1f}%")
        else:
            ax.text(0.5, 0.5, "No data", ha='center', va='center')
            ax.set_title("Match Rate")
    
    def _plot_genre_distribution(self, ax):
        """Plot genre distribution"""
        # Collect genres from results
        genres = {}
        for result in self.results:
            if result.matched and hasattr(result, 'beatport_genres'):
                for genre in result.beatport_genres:
                    genres[genre] = genres.get(genre, 0) + 1
        
        if genres:
            labels = list(genres.keys())
            values = list(genres.values())
            ax.bar(labels, values)
            ax.set_title("Genre Distribution")
            ax.set_xlabel("Genre")
            ax.set_ylabel("Count")
            ax.tick_params(axis='x', rotation=45)
        else:
            ax.text(0.5, 0.5, "No genre data", ha='center', va='center')
            ax.set_title("Genre Distribution")
    
    def _plot_year_distribution(self, ax):
        """Plot year distribution"""
        years = [r.beatport_year for r in self.results if r.matched and r.beatport_year]
        
        if years:
            ax.hist(years, bins=20, edgecolor='black')
            ax.set_title("Year Distribution")
            ax.set_xlabel("Year")
            ax.set_ylabel("Count")
        else:
            ax.text(0.5, 0.5, "No year data", ha='center', va='center')
            ax.set_title("Year Distribution")
    
    def _plot_bpm_distribution(self, ax):
        """Plot BPM distribution"""
        bpms = []
        for r in self.results:
            if r.matched and r.beatport_bpm:
                try:
                    bpm = float(r.beatport_bpm)
                    bpms.append(bpm)
                except (ValueError, TypeError):
                    pass
        
        if bpms:
            ax.hist(bpms, bins=30, edgecolor='black')
            ax.set_title("BPM Distribution")
            ax.set_xlabel("BPM")
            ax.set_ylabel("Count")
        else:
            ax.text(0.5, 0.5, "No BPM data", ha='center', va='center')
            ax.set_title("BPM Distribution")
    
    def _plot_artist_statistics(self, ax):
        """Plot artist statistics"""
        artists = {}
        for result in self.results:
            if result.matched and result.beatport_artist:
                artist = result.beatport_artist
                artists[artist] = artists.get(artist, 0) + 1
        
        if artists:
            # Get top 10 artists
            top_artists = sorted(artists.items(), key=lambda x: x[1], reverse=True)[:10]
            labels = [a[0] for a in top_artists]
            values = [a[1] for a in top_artists]
            
            ax.barh(labels, values)
            ax.set_title("Top 10 Artists")
            ax.set_xlabel("Track Count")
        else:
            ax.text(0.5, 0.5, "No artist data", ha='center', va='center')
            ax.set_title("Artist Statistics")
```

**Implementation Checklist**:
- [ ] Integrate analytics view into main window
- [ ] Add analytics tab
- [ ] Add chart type selector
- [ ] Add update button
- [ ] Add export button
- [ ] Implement chart generation methods
- [ ] Implement export functionality
- [ ] Add status label
- [ ] Test UI interactions
- [ ] Test chart rendering
- [ ] Test export functionality

---

## Comprehensive Testing (2-3 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_analytics.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for visual analytics dashboard.

Tests chart generation, statistics calculation, and export functionality.
"""

import unittest
from unittest.mock import Mock, patch
from PySide6.QtWidgets import QApplication
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.analytics_view import AnalyticsView

class TestAnalytics(unittest.TestCase):
    """Comprehensive tests for analytics functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = AnalyticsView()
        # Create mock results
        self.mock_results = [
            Mock(matched=True, beatport_year=2020, beatport_bpm="128", 
                 beatport_genres=["House"], beatport_artist="Artist 1"),
            Mock(matched=True, beatport_year=2021, beatport_bpm="130",
                 beatport_genres=["Techno"], beatport_artist="Artist 2"),
            Mock(matched=False, beatport_year=None, beatport_bpm=None,
                 beatport_genres=[], beatport_artist=None),
        ]
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.view.close()
    
    def test_update_results(self):
        """Test updating results"""
        self.view.update_results(self.mock_results)
        self.assertEqual(len(self.view.results), 3)
    
    def test_match_rate_chart(self):
        """Test match rate chart generation"""
        self.view.update_results(self.mock_results)
        self.view.chart_type_combo.setCurrentText("Match Rate")
        self.view.update_charts()
        
        # Verify chart was generated
        self.assertIsNotNone(self.view.figure)
    
    def test_genre_distribution_chart(self):
        """Test genre distribution chart generation"""
        self.view.update_results(self.mock_results)
        self.view.chart_type_combo.setCurrentText("Genre Distribution")
        self.view.update_charts()
        
        # Verify chart was generated
        self.assertIsNotNone(self.view.figure)
    
    def test_year_distribution_chart(self):
        """Test year distribution chart generation"""
        self.view.update_results(self.mock_results)
        self.view.chart_type_combo.setCurrentText("Year Distribution")
        self.view.update_charts()
        
        # Verify chart was generated
        self.assertIsNotNone(self.view.figure)
    
    def test_bpm_distribution_chart(self):
        """Test BPM distribution chart generation"""
        self.view.update_results(self.mock_results)
        self.view.chart_type_combo.setCurrentText("BPM Distribution")
        self.view.update_charts()
        
        # Verify chart was generated
        self.assertIsNotNone(self.view.figure)
    
    def test_empty_data_handling(self):
        """Test handling of empty data"""
        self.view.update_results([])
        self.view.update_charts()
        
        # Should handle gracefully without errors
        self.assertIsNotNone(self.view.figure)
    
    def test_export_chart(self):
        """Test chart export functionality"""
        import tempfile
        import os
        
        self.view.update_results(self.mock_results)
        self.view.update_charts()
        
        # Export to temporary file
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            with patch('SRC.gui.analytics_view.QFileDialog.getSaveFileName') as mock_dialog:
                mock_dialog.return_value = (tmp_path, "")
                
                self.view.export_chart()
                
                # Verify file was created
                self.assertTrue(os.path.exists(tmp_path))
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_analytics_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for analytics dashboard.

Tests UI interactions and chart display.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.analytics_view import AnalyticsView

class TestAnalyticsGUI(unittest.TestCase):
    """Tests for analytics GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.view = AnalyticsView()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.view.close()
    
    def test_chart_type_combo_exists(self):
        """Test chart type combo exists"""
        self.assertIsNotNone(self.view.chart_type_combo)
        self.assertEqual(self.view.chart_type_combo.count(), 6)
    
    def test_update_button_exists(self):
        """Test update button exists"""
        self.assertIsNotNone(self.view.update_button)
    
    def test_export_button_exists(self):
        """Test export button exists"""
        self.assertIsNotNone(self.view.export_button)
    
    def test_canvas_exists(self):
        """Test chart canvas exists"""
        self.assertIsNotNone(self.view.canvas)

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Analytics tab is visible in main window
- [ ] Chart type combo box works
- [ ] Update button works
- [ ] Export button works
- [ ] Charts display correctly
- [ ] Charts update when data changes
- [ ] Status label shows correct message
- [ ] Empty data handled gracefully
- [ ] Chart rendering is fast (< 2 seconds)
- [ ] Export dialog works
- [ ] Export creates valid image files

**Functional Testing Checklist**:
- [ ] Match rate chart displays correctly
- [ ] Genre distribution chart displays correctly
- [ ] Year distribution chart displays correctly
- [ ] BPM distribution chart displays correctly
- [ ] Artist statistics chart displays correctly
- [ ] All charts option displays all charts
- [ ] Individual chart options display single chart
- [ ] Charts update with new results
- [ ] Export works for PNG format
- [ ] Export works for PDF format
- [ ] Export works for SVG format
- [ ] Statistics calculate correctly
- [ ] Performance is acceptable

**Performance Testing Checklist**:
- [ ] Dashboard load time: < 1 second
- [ ] Chart rendering time: < 2 seconds for 1000 tracks
- [ ] Data aggregation time: < 500ms
- [ ] Memory usage: Reasonable
- [ ] No performance degradation with large datasets
- [ ] Charts render smoothly

**Error Scenario Testing**:
- [ ] Empty data → Handled gracefully
- [ ] Missing fields → Handled gracefully
- [ ] Invalid data types → Handled gracefully
- [ ] Export errors → Clear error messages
- [ ] Chart rendering errors → Handled gracefully
- [ ] Error messages are clear and helpful

**Cross-Step Integration Testing**:
- [ ] Analytics works with Phase 3 performance tracking
- [ ] Analytics works with Step 4.1 (Enhanced Export)
- [ ] Analytics works with Step 4.2 (Advanced Filtering)
- [ ] Analytics works with Database Integration (if implemented)
- [ ] Analytics integrates with results view

**Acceptance Criteria Verification**:
- ✅ Charts displayed correctly
- ✅ Statistics accurate
- ✅ Performance acceptable
- ✅ Export works
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Error Handling

### Error Scenarios
1. **Empty Data**: Handle no results gracefully
2. **Chart Rendering Errors**: Handle matplotlib errors
3. **Performance Issues**: Optimize for large datasets

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Dashboard is optional
- [ ] No breaking changes
- [ ] Existing features unchanged

---

## Documentation Requirements

### User Guide Updates
- [ ] Document dashboard features
- [ ] Explain charts
- [ ] Provide usage examples

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track dashboard load time
- [ ] Track chart rendering time
- [ ] Track data aggregation time

---

## Acceptance Criteria
- ✅ Charts displayed correctly
- ✅ Statistics accurate
- ✅ Performance acceptable
- ✅ Export works
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.10.1: Add Charting Library
- [ ] Substep 4.10.2: Create Analytics Dashboard Widget
- [ ] Testing
- [ ] Documentation updated

---

**IMPORTANT**: This is a future feature. Only implement if users request visual analytics/visualization features. Evaluate need based on user feedback.

**See Also**: See `00_Future_Features_Overview.md` for other future features and implementation considerations.

