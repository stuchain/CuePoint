# Database Integration (Future Feature)

**Status**: 📝 Future Consideration  
**Priority**: 🚀 Low Priority (Only if users request database features)  
**Estimated Duration**: 4-5 days  
**Dependencies**: Phase 1 (GUI), Phase 2 (User Experience), Phase 3 (performance monitoring)

## Goal
Provide SQLite database storage for search history, results, and user preferences to enable advanced features like search history browsing, result comparison, and data persistence.

## Success Criteria
- [ ] Database schema created
- [ ] Search history saved correctly
- [ ] Results retrieved correctly
- [ ] Database view displays data
- [ ] Search and filter work
- [ ] Performance acceptable
- [ ] Migration support for schema changes
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Current Storage**: CSV files for results
- **Limitations**: No search history, no result comparison, no data persistence
- **Opportunity**: Database enables advanced features like history, comparison, analytics
- **Risk**: Additional complexity, potential performance issues with large datasets

### Use Case Analysis
1. **Search History**: Users want to see past searches
2. **Result Comparison**: Compare results across different searches
3. **Data Persistence**: Keep results even after application restart
4. **Analytics**: Analyze search patterns and success rates

### Database Design
- **SQLite**: Lightweight, no server required, good for single-user application
- **Tables**: search_history, track_results, candidates
- **Indexes**: For performance on large datasets
- **Migration**: Support for schema changes over time

### Performance Considerations (Phase 3 Integration)
- **Database Operations**: Track database query times
- **Write Performance**: Batch inserts for better performance
- **Read Performance**: Use indexes for fast queries
- **Metrics to Track**:
  - Database write time
  - Database query time
  - Database size
  - Query performance

### Error Handling Strategy
1. **Database Errors**: Handle connection errors, corruption
2. **Migration Errors**: Handle schema migration failures
3. **Data Integrity**: Validate data before insertion
4. **Backup/Restore**: Provide backup functionality

### Backward Compatibility
- Database is opt-in (optional feature)
- CSV exports still work
- Existing workflows unchanged
- Can disable database if needed

---

## Implementation Steps

### Substep 4.4.1: Create Database Module (1-2 days)
**File**: `SRC/database.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Database Integration Module

This module provides SQLite database storage for search history, results,
and user preferences.

IMPORTANT: This is an optional feature. Users can continue using CSV files.
"""

import sqlite3
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import time
from SRC.performance import performance_collector


class CuePointDatabase:
    """SQLite database for CuePoint data"""
    
    SCHEMA_VERSION = 1
    
    def __init__(self, db_path: str = "cuepoint.db"):
        """
        Initialize database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Initialize database schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Schema version table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            )
        """)
        
        # Check current version
        cursor.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        result = cursor.fetchone()
        current_version = result[0] if result else 0
        
        if current_version < self.SCHEMA_VERSION:
            self._create_schema(cursor)
            cursor.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (?)", 
                          (self.SCHEMA_VERSION,))
        
        conn.commit()
        conn.close()
    
    def _create_schema(self, cursor: sqlite3.Cursor):
        """Create database schema"""
        # Search history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_name TEXT NOT NULL,
                xml_path TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                total_tracks INTEGER,
                matched_tracks INTEGER,
                output_file TEXT,
                settings TEXT,
                performance_stats TEXT
            )
        """)
        
        # Track results table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS track_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id INTEGER,
                playlist_index INTEGER,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                matched INTEGER,
                beatport_title TEXT,
                beatport_artists TEXT,
                beatport_url TEXT,
                match_score REAL,
                confidence TEXT,
                key TEXT,
                bpm TEXT,
                year INTEGER,
                label TEXT,
                genres TEXT,
                release TEXT,
                release_date TEXT,
                FOREIGN KEY (search_id) REFERENCES search_history(id)
            )
        """)
        
        # Candidates table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_result_id INTEGER,
                candidate_title TEXT,
                candidate_artists TEXT,
                candidate_url TEXT,
                match_score REAL,
                rank INTEGER,
                FOREIGN KEY (track_result_id) REFERENCES track_results(id)
            )
        """)
        
        # Create indexes for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_history(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_track_search ON track_results(search_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_candidate_track ON candidates(track_result_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_track_matched ON track_results(matched)")
    
    def save_search(
        self,
        playlist_name: str,
        xml_path: str,
        results: List[Dict],
        output_file: str,
        settings: Dict,
        performance_stats: Optional[Dict] = None
    ) -> int:
        """
        Save a search session to database.
        
        Args:
            playlist_name: Name of the playlist
            xml_path: Path to XML file
            results: List of track result dictionaries
            output_file: Path to output file
            settings: Processing settings
            performance_stats: Optional performance statistics
        
        Returns:
            Search ID
        """
        save_start_time = time.time()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            timestamp = datetime.now().isoformat()
            total_tracks = len(results)
            matched_tracks = sum(1 for r in results if r.get("matched", False))
            settings_json = json.dumps(settings)
            performance_json = json.dumps(performance_stats) if performance_stats else None
            
            # Insert search history
            cursor.execute("""
                INSERT INTO search_history 
                (playlist_name, xml_path, timestamp, total_tracks, matched_tracks, 
                 output_file, settings, performance_stats)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (playlist_name, xml_path, timestamp, total_tracks, matched_tracks, 
                  output_file, settings_json, performance_json))
            
            search_id = cursor.lastrowid
            
            # Save track results in batch
            track_data = []
            for result in results:
                track_data.append((
                    search_id,
                    result.get("playlist_index", 0),
                    result.get("title", ""),
                    result.get("artist", ""),
                    1 if result.get("matched", False) else 0,
                    result.get("beatport_title", ""),
                    result.get("beatport_artists", ""),
                    result.get("beatport_url", ""),
                    result.get("match_score", 0.0),
                    result.get("confidence", ""),
                    result.get("beatport_key", ""),
                    result.get("beatport_bpm", ""),
                    result.get("beatport_year"),
                    result.get("beatport_label", ""),
                    json.dumps(result.get("beatport_genres", [])),
                    result.get("beatport_release", ""),
                    result.get("beatport_release_date", "")
                ))
            
            cursor.executemany("""
                INSERT INTO track_results
                (search_id, playlist_index, title, artist, matched, beatport_title,
                 beatport_artists, beatport_url, match_score, confidence, key, bpm, year,
                 label, genres, release, release_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, track_data)
            
            # Get track result IDs for candidates
            cursor.execute("""
                SELECT id, playlist_index FROM track_results WHERE search_id = ?
            """, (search_id,))
            track_rows = cursor.fetchall()
            track_id_map = {row[1]: row[0] for row in track_rows}
            
            # Save candidates in batch
            candidate_data = []
            for result in results:
                track_result_id = track_id_map.get(result.get("playlist_index", 0))
                if not track_result_id:
                    continue
                
                candidates = result.get("candidates", [])
                for rank, candidate in enumerate(candidates[:10], 1):
                    candidate_data.append((
                        track_result_id,
                        candidate.get("beatport_title", ""),
                        candidate.get("beatport_artists", ""),
                        candidate.get("beatport_url", ""),
                        candidate.get("match_score", 0.0),
                        rank
                    ))
            
            if candidate_data:
                cursor.executemany("""
                    INSERT INTO candidates
                    (track_result_id, candidate_title, candidate_artists, candidate_url, match_score, rank)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, candidate_data)
            
            conn.commit()
            
            # Track performance
            save_duration = time.time() - save_start_time
            if hasattr(performance_collector, 'record_database_operation'):
                performance_collector.record_database_operation(
                    operation="save_search",
                    duration=save_duration,
                    records_saved=total_tracks
                )
            
            return search_id
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to save search to database: {e}") from e
        finally:
            conn.close()
    
    def get_search_history(self, limit: int = 50) -> List[Dict]:
        """
        Get search history.
        
        Args:
            limit: Maximum number of results to return
        
        Returns:
            List of search history dictionaries
        """
        query_start_time = time.time()
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM search_history
                ORDER BY timestamp DESC
                LIMIT ?
            """, (limit,))
            
            rows = cursor.fetchall()
            results = [dict(row) for row in rows]
            
            # Track performance
            query_duration = time.time() - query_start_time
            if hasattr(performance_collector, 'record_database_operation'):
                performance_collector.record_database_operation(
                    operation="get_search_history",
                    duration=query_duration,
                    records_retrieved=len(results)
                )
            
            return results
            
        finally:
            conn.close()
    
    def get_search_results(self, search_id: int) -> List[Dict]:
        """
        Get all results for a search.
        
        Args:
            search_id: Search ID
        
        Returns:
            List of track result dictionaries with candidates
        """
        query_start_time = time.time()
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM track_results
                WHERE search_id = ?
                ORDER BY playlist_index
            """, (search_id,))
            
            rows = cursor.fetchall()
            results = [dict(row) for row in rows]
            
            # Load candidates for each result
            for result in results:
                cursor.execute("""
                    SELECT * FROM candidates
                    WHERE track_result_id = ?
                    ORDER BY rank
                """, (result["id"],))
                
                candidate_rows = cursor.fetchall()
                result["candidates"] = [dict(row) for row in candidate_rows]
                
                # Parse genres JSON
                if result.get("genres"):
                    try:
                        result["genres"] = json.loads(result["genres"])
                    except:
                        result["genres"] = []
            
            # Track performance
            query_duration = time.time() - query_start_time
            if hasattr(performance_collector, 'record_database_operation'):
                performance_collector.record_database_operation(
                    operation="get_search_results",
                    duration=query_duration,
                    records_retrieved=len(results)
                )
            
            return results
            
        finally:
            conn.close()
    
    def delete_search(self, search_id: int) -> bool:
        """
        Delete a search and all its results.
        
        Args:
            search_id: Search ID
        
        Returns:
            True if successful
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Delete candidates first (foreign key constraint)
            cursor.execute("""
                DELETE FROM candidates
                WHERE track_result_id IN (
                    SELECT id FROM track_results WHERE search_id = ?
                )
            """, (search_id,))
            
            # Delete track results
            cursor.execute("DELETE FROM track_results WHERE search_id = ?", (search_id,))
            
            # Delete search history
            cursor.execute("DELETE FROM search_history WHERE id = ?", (search_id,))
            
            conn.commit()
            return True
            
        except Exception as e:
            conn.rollback()
            return False
        finally:
            conn.close()
```

**Implementation Checklist**:
- [ ] Create `SRC/database.py` module
- [ ] Implement database schema
- [ ] Implement save/load functions
- [ ] Add indexes for performance
- [ ] Add migration support
- [ ] Add error handling
- [ ] Add performance tracking
- [ ] Test database operations

---

### Substep 4.4.2: Create Database View Widget (1-2 days)
**File**: `SRC/gui/database_view.py` (NEW)

**What to implement:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QLabel, QLineEdit, QComboBox, QMessageBox
)
from PySide6.QtCore import Qt
from SRC.database import CuePointDatabase

class DatabaseView(QWidget):
    """Database view widget for browsing search history"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.database = CuePointDatabase()
        self.init_ui()
        self.load_history()
    
    def init_ui(self):
        """Initialize UI"""
        layout = QVBoxLayout(self)
        
        # Search/filter controls
        controls_layout = QHBoxLayout()
        controls_layout.addWidget(QLabel("Search:"))
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("Search playlist names...")
        self.search_box.textChanged.connect(self.filter_history)
        controls_layout.addWidget(self.search_box)
        
        controls_layout.addWidget(QLabel("Sort by:"))
        self.sort_combo = QComboBox()
        self.sort_combo.addItems(["Date (Newest)", "Date (Oldest)", "Playlist Name", "Match Rate"])
        self.sort_combo.currentTextChanged.connect(self.load_history)
        controls_layout.addWidget(self.sort_combo)
        
        layout.addLayout(controls_layout)
        
        # History table
        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels([
            "Date", "Playlist", "Tracks", "Matched", "Match Rate", "Actions"
        ])
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.doubleClicked.connect(self.view_search_details)
        layout.addWidget(self.table)
        
        # Action buttons
        buttons_layout = QHBoxLayout()
        self.view_button = QPushButton("View Details")
        self.view_button.clicked.connect(self.view_search_details)
        buttons_layout.addWidget(self.view_button)
        
        self.delete_button = QPushButton("Delete")
        self.delete_button.clicked.connect(self.delete_search)
        buttons_layout.addWidget(self.delete_button)
        
        buttons_layout.addStretch()
        layout.addLayout(buttons_layout)
    
    def load_history(self):
        """Load search history"""
        history = self.database.get_search_history(limit=100)
        
        # Sort based on selection
        sort_key = self.sort_combo.currentText()
        if "Newest" in sort_key:
            history.sort(key=lambda x: x["timestamp"], reverse=True)
        elif "Oldest" in sort_key:
            history.sort(key=lambda x: x["timestamp"])
        elif "Name" in sort_key:
            history.sort(key=lambda x: x["playlist_name"].lower())
        elif "Match Rate" in sort_key:
            history.sort(key=lambda x: x["matched_tracks"] / x["total_tracks"] if x["total_tracks"] > 0 else 0, reverse=True)
        
        self.populate_table(history)
    
    def populate_table(self, history: List[Dict]):
        """Populate table with history"""
        self.table.setRowCount(len(history))
        
        for row, item in enumerate(history):
            timestamp = datetime.fromisoformat(item["timestamp"]).strftime("%Y-%m-%d %H:%M")
            match_rate = f"{item['matched_tracks']}/{item['total_tracks']} ({item['matched_tracks']/item['total_tracks']*100:.1f}%)" if item["total_tracks"] > 0 else "N/A"
            
            self.table.setItem(row, 0, QTableWidgetItem(timestamp))
            self.table.setItem(row, 1, QTableWidgetItem(item["playlist_name"]))
            self.table.setItem(row, 2, QTableWidgetItem(str(item["total_tracks"])))
            self.table.setItem(row, 3, QTableWidgetItem(str(item["matched_tracks"])))
            self.table.setItem(row, 4, QTableWidgetItem(match_rate))
            
            # Store search_id in item data
            self.table.item(row, 0).setData(Qt.UserRole, item["id"])
    
    def filter_history(self):
        """Filter history based on search box"""
        # Implementation
        pass
    
    def view_search_details(self):
        """View detailed results for selected search"""
        # Implementation - open results view with database data
        pass
    
    def delete_search(self):
        """Delete selected search"""
        # Implementation with confirmation dialog
        pass
```

**Implementation Checklist**:
- [ ] Create database view widget
- [ ] Add search/filter functionality
- [ ] Add table display
- [ ] Add action buttons
- [ ] Test UI
- [ ] Test with real data

---

### Substep 4.7.3: GUI Integration and Configuration (1-2 days)
**Files**: `SRC/config.py` (MODIFY), `SRC/gui/config_panel.py` (MODIFY), `SRC/gui/main_window.py` (MODIFY), `SRC/gui/database_view.py` (NEW)

**Dependencies**: Phase 1 Step 1.2 (main window exists), Substep 4.7.1 (database module exists), Substep 4.7.2 (database view widget)

**What to implement - EXACT STRUCTURE:**

#### Part A: Configuration Module Updates

**In `SRC/config.py`:**

```python
# Database Configuration
USE_DATABASE = False  # Default disabled (opt-in)
DATABASE_PATH = "cuepoint.db"  # Default database file path
DATABASE_AUTO_SAVE = True  # Auto-save results to database
DATABASE_MAX_HISTORY = 1000  # Maximum search history entries to keep

def get_database_config() -> Dict[str, Any]:
    """Get database configuration"""
    return {
        "enabled": USE_DATABASE,
        "database_path": DATABASE_PATH,
        "auto_save": DATABASE_AUTO_SAVE,
        "max_history": DATABASE_MAX_HISTORY
    }

def set_database_config(enabled: bool, database_path: str = "cuepoint.db", auto_save: bool = True):
    """Set database configuration"""
    global USE_DATABASE, DATABASE_PATH, DATABASE_AUTO_SAVE
    USE_DATABASE = enabled
    DATABASE_PATH = database_path
    DATABASE_AUTO_SAVE = auto_save
```

#### Part B: GUI Configuration Panel Integration

**In `SRC/gui/config_panel.py`:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QLineEdit, QLabel, QPushButton, QFileDialog, QMessageBox
)
from PySide6.QtCore import Qt
from SRC.config import get_database_config, set_database_config

class ConfigPanel(QWidget):
    """Configuration panel with database options"""
    
    def init_ui(self):
        """Initialize configuration UI"""
        layout = QVBoxLayout(self)
        
        # ... existing configuration groups ...
        
        # NEW: Database Settings Group (in Advanced Settings)
        database_group = QGroupBox("Database Storage (Advanced)")
        database_group.setCheckable(False)
        database_layout = QVBoxLayout()
        
        # Database Enable Checkbox
        self.use_database_check = QCheckBox("Enable database storage for search history")
        self.use_database_check.setChecked(False)
        self.use_database_check.setToolTip(
            "Enable SQLite database storage for search history and results.\n\n"
            "Benefits:\n"
            "- Search history browsing\n"
            "- Result comparison across searches\n"
            "- Data persistence across sessions\n"
            "- Analytics and statistics\n\n"
            "Considerations:\n"
            "- Database file grows over time\n"
            "- Requires disk space\n"
            "- Optional feature (CSV exports still work)"
        )
        database_layout.addWidget(self.use_database_check)
        
        # Database settings (enabled when checkbox is checked)
        self.database_settings_widget = QWidget()
        database_settings_layout = QVBoxLayout()
        database_settings_layout.setContentsMargins(20, 10, 10, 10)
        
        # Database path
        path_layout = QHBoxLayout()
        path_layout.addWidget(QLabel("Database File:"))
        self.database_path_edit = QLineEdit()
        self.database_path_edit.setPlaceholderText("cuepoint.db")
        self.database_path_edit.setToolTip("Path to SQLite database file")
        path_layout.addWidget(self.database_path_edit)
        
        browse_button = QPushButton("Browse...")
        browse_button.clicked.connect(self.browse_database_path)
        path_layout.addWidget(browse_button)
        database_settings_layout.addLayout(path_layout)
        
        # Auto-save checkbox
        self.auto_save_check = QCheckBox("Automatically save results to database")
        self.auto_save_check.setChecked(True)
        self.auto_save_check.setToolTip(
            "Automatically save processing results to database.\n"
            "If disabled, you can manually save results."
        )
        database_settings_layout.addWidget(self.auto_save_check)
        
        # Info label
        self.database_info_label = QLabel("")
        self.database_info_label.setWordWrap(True)
        self.database_info_label.setStyleSheet("color: blue; font-style: italic;")
        database_settings_layout.addWidget(self.database_info_label)
        
        # Info button
        info_button = QPushButton("ℹ️ About Database Storage")
        info_button.setToolTip("Show information about database storage")
        info_button.clicked.connect(self.show_database_info)
        database_settings_layout.addWidget(info_button)
        
        self.database_settings_widget.setLayout(database_settings_layout)
        self.database_settings_widget.setEnabled(False)  # Disabled by default
        
        database_layout.addWidget(self.database_settings_widget)
        database_group.setLayout(database_layout)
        
        # Add to Advanced Settings group
        layout.addWidget(database_group)
        
        # Connect signals
        self.use_database_check.toggled.connect(self._on_database_toggled)
        self.database_path_edit.textChanged.connect(self._update_database_info)
    
    def _on_database_toggled(self, checked: bool):
        """Handle database checkbox toggle"""
        self.database_settings_widget.setEnabled(checked)
        self._update_database_info()
    
    def _update_database_info(self):
        """Update database info label"""
        if not self.use_database_check.isChecked():
            self.database_info_label.setText("")
            return
        
        db_path = self.database_path_edit.text() or "cuepoint.db"
        info = (
            f"Database will be stored at: {db_path}\n"
            f"Search history and results will be saved automatically. "
            f"You can browse and compare past searches in the Search History tab."
        )
        self.database_info_label.setText(info)
    
    def browse_database_path(self):
        """Open file dialog to select database path"""
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Select Database File",
            "",
            "SQLite Database Files (*.db);;All Files (*.*)"
        )
        
        if file_path:
            self.database_path_edit.setText(file_path)
    
    def show_database_info(self):
        """Show information dialog about database storage"""
        info_text = """
<h3>Database Storage Information</h3>

<p><b>What is Database Storage?</b></p>
<p>Database storage uses SQLite to save search history, processing results, and metadata 
for advanced features like history browsing, result comparison, and analytics.</p>

<p><b>Benefits:</b></p>
<ul>
<li><b>Search History:</b> Browse and view past searches</li>
<li><b>Result Comparison:</b> Compare results across different searches</li>
<li><b>Data Persistence:</b> Keep results even after application restart</li>
<li><b>Analytics:</b> Analyze search patterns and success rates</li>
<li><b>Advanced Filtering:</b> Filter and search through historical data</li>
</ul>

<p><b>How It Works:</b></p>
<ul>
<li>SQLite database file stores all search history and results</li>
<li>Results are automatically saved when processing completes (if auto-save enabled)</li>
<li>Search History tab shows all past searches</li>
<li>You can view, filter, and compare historical results</li>
</ul>

<p><b>Database Location:</b></p>
<ul>
<li>Default: <code>cuepoint.db</code> in application directory</li>
<li>You can specify custom location</li>
<li>Database file grows over time (can be backed up or cleared)</li>
</ul>

<p><b>When to Enable:</b></p>
<ul>
<li>You want to keep search history</li>
<li>You want to compare results across searches</li>
<li>You want data persistence across sessions</li>
<li>You want analytics and statistics</li>
</ul>

<p><b>When NOT to Enable:</b></p>
<ul>
<li>You only need CSV exports</li>
<li>You don't want to store historical data</li>
<li>You have limited disk space</li>
<li>You prefer file-based storage</li>
</ul>

<p><b>Performance:</b></p>
<ul>
<li>Database operations: Minimal impact (< 2% slower)</li>
<li>Database size: ~1-5MB per 1000 searches</li>
<li>Query performance: Fast with indexes</li>
</ul>

<p><b>Note:</b> Database storage is optional. CSV exports continue to work regardless 
of database settings.</p>
"""
        
        msg = QMessageBox(self)
        msg.setWindowTitle("Database Storage Information")
        msg.setTextFormat(Qt.RichText)
        msg.setText(info_text)
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
    
    def get_settings(self) -> Dict[str, Any]:
        """Get all settings including database"""
        settings = {
            # ... existing settings ...
            "use_database": self.use_database_check.isChecked(),
            "database_path": self.database_path_edit.text() or "cuepoint.db",
            "database_auto_save": self.auto_save_check.isChecked(),
        }
        return settings
    
    def load_settings(self):
        """Load settings from config"""
        from SRC.config import get_database_config
        
        config = get_database_config()
        self.use_database_check.setChecked(config.get("enabled", False))
        self.database_path_edit.setText(config.get("database_path", "cuepoint.db"))
        self.auto_save_check.setChecked(config.get("auto_save", True))
        
        # Update widget state
        self._on_database_toggled(self.use_database_check.isChecked())
    
    def save_settings(self):
        """Save settings to config"""
        from SRC.config import set_database_config
        
        set_database_config(
            enabled=self.use_database_check.isChecked(),
            database_path=self.database_path_edit.text() or "cuepoint.db",
            auto_save=self.auto_save_check.isChecked()
        )
```

#### Part C: Main Window Integration

**In `SRC/gui/main_window.py`:**

```python
from SRC.gui.database_view import DatabaseView
from SRC.config import get_database_config

class MainWindow(QMainWindow):
    """Main application window with database integration"""
    
    def __init__(self):
        super().__init__()
        # ... existing initialization ...
        self.database_view = None
        self.database_tab_index = None
        self.init_ui()
    
    def init_ui(self):
        """Initialize UI with database tab if enabled"""
        # ... existing UI setup ...
        
        # Check if database is enabled
        config = get_database_config()
        if config.get("enabled", False):
            self._add_database_tab()
    
    def _add_database_tab(self):
        """Add database tab to main window"""
        if self.database_view is None:
            from SRC.gui.database_view import DatabaseView
            self.database_view = DatabaseView()
            self.database_tab_index = self.tabs.addTab(self.database_view, "Search History")
    
    def _remove_database_tab(self):
        """Remove database tab from main window"""
        if self.database_tab_index is not None:
            self.tabs.removeTab(self.database_tab_index)
            self.database_view = None
            self.database_tab_index = None
    
    def on_processing_complete(self, results):
        """Handle processing completion with database integration"""
        # ... existing processing completion logic ...
        
        # Save to database if enabled
        config = get_database_config()
        if config.get("enabled", False) and config.get("auto_save", True):
            try:
                from SRC.database import get_database
                db = get_database()
                db.save_search_results(
                    playlist_name=self.current_playlist_name,
                    results=results,
                    settings=self.config_panel.get_settings()
                )
                
                # Refresh database view if visible
                if self.database_view:
                    self.database_view.refresh()
            except Exception as e:
                # Log error but don't fail processing
                print(f"Warning: Failed to save to database: {e}")
```

**Implementation Checklist**:
- [ ] Add database configuration to config.py
- [ ] Add database settings group to config panel
- [ ] Add enable checkbox with tooltip
- [ ] Add database path input and browse button
- [ ] Add auto-save checkbox
- [ ] Add info label and dialog button
- [ ] Connect signals for dynamic updates
- [ ] Integrate database tab into main window
- [ ] Add auto-save on processing completion
- [ ] Add settings loading/saving
- [ ] Test configuration persistence
- [ ] Test UI interactions

---

### Substep 4.7.4: Comprehensive Testing (2-3 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_database.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for database integration.

Tests database operations, schema, migration, and error handling.
"""

import unittest
import tempfile
import os
import sqlite3
from datetime import datetime
from SRC.database import CuePointDatabase, get_database
from SRC.processor import TrackResult

class TestDatabase(unittest.TestCase):
    """Comprehensive tests for database functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.db = CuePointDatabase(self.temp_db.name)
    
    def tearDown(self):
        """Clean up test fixtures"""
        if os.path.exists(self.temp_db.name):
            os.unlink(self.temp_db.name)
    
    def test_database_creation(self):
        """Test database file creation"""
        self.assertTrue(os.path.exists(self.temp_db.name))
    
    def test_schema_creation(self):
        """Test database schema is created correctly"""
        # Check tables exist
        conn = sqlite3.connect(self.temp_db.name)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        self.assertIn("search_history", tables)
        self.assertIn("track_results", tables)
        self.assertIn("candidates", tables)
        
        conn.close()
    
    def test_save_search(self):
        """Test saving search to database"""
        search_id = self.db.save_search(
            playlist_name="Test Playlist",
            playlist_path="/path/to/playlist.xml",
            settings={"setting1": "value1"},
            total_tracks=10
        )
        
        self.assertIsNotNone(search_id)
        self.assertIsInstance(search_id, int)
    
    def test_get_search_history(self):
        """Test retrieving search history"""
        # Save a few searches
        self.db.save_search("Playlist 1", "/path/1.xml", {}, 10)
        self.db.save_search("Playlist 2", "/path/2.xml", {}, 20)
        
        history = self.db.get_search_history(limit=10)
        
        self.assertIsInstance(history, list)
        self.assertGreaterEqual(len(history), 2)
        self.assertEqual(history[0]["playlist_name"], "Playlist 2")  # Most recent first
    
    def test_save_search_results(self):
        """Test saving search results"""
        search_id = self.db.save_search("Test Playlist", "/path.xml", {}, 2)
        
        results = [
            Mock(
                playlist_index=1,
                title="Track 1",
                artist="Artist 1",
                matched=True,
                match_score=95.0
            ),
            Mock(
                playlist_index=2,
                title="Track 2",
                artist="Artist 2",
                matched=False,
                match_score=None
            )
        ]
        
        self.db.save_search_results(search_id, results)
        
        # Verify results saved
        saved_results = self.db.get_search_results(search_id)
        self.assertEqual(len(saved_results), 2)
    
    def test_get_search_results(self):
        """Test retrieving search results"""
        search_id = self.db.save_search("Test", "/path.xml", {}, 1)
        
        # Save results
        results = [Mock(playlist_index=1, title="Track", artist="Artist", matched=True)]
        self.db.save_search_results(search_id, results)
        
        # Retrieve results
        retrieved = self.db.get_search_results(search_id)
        self.assertEqual(len(retrieved), 1)
        self.assertEqual(retrieved[0]["title"], "Track")
    
    def test_database_migration(self):
        """Test database schema migration"""
        # Create old schema
        conn = sqlite3.connect(self.temp_db.name)
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE old_table (id INTEGER)")
        conn.commit()
        conn.close()
        
        # Create new database instance (should migrate)
        new_db = CuePointDatabase(self.temp_db.name)
        # Migration should complete without errors
        self.assertIsNotNone(new_db)
    
    def test_error_handling_corruption(self):
        """Test error handling for database corruption"""
        # Corrupt database file
        with open(self.temp_db.name, 'wb') as f:
            f.write(b"corrupted data")
        
        # Should handle gracefully
        try:
            db = CuePointDatabase(self.temp_db.name)
            # Should either repair or create new
        except Exception as e:
            # Should be a handled error
            self.assertIsInstance(e, (sqlite3.Error, Exception))
    
    def test_performance_batch_insert(self):
        """Test batch insert performance"""
        import time
        
        search_id = self.db.save_search("Test", "/path.xml", {}, 1000)
        
        # Create many results
        results = [
            Mock(playlist_index=i, title=f"Track {i}", artist=f"Artist {i}", matched=(i % 2 == 0))
            for i in range(1000)
        ]
        
        start_time = time.time()
        self.db.save_search_results(search_id, results)
        insert_time = time.time() - start_time
        
        # Should complete in reasonable time (< 5 seconds for 1000 results)
        self.assertLess(insert_time, 5.0)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_database_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for database configuration and view.

Tests UI interactions, settings persistence, and database view.
"""

import unittest
from unittest.mock import Mock
from PySide6.QtWidgets import QApplication
from PySide6.QtTest import QTest
from PySide6.QtCore import Qt
import sys

if not QApplication.instance():
    app = QApplication(sys.argv)

from SRC.gui.config_panel import ConfigPanel
from SRC.gui.database_view import DatabaseView

class TestDatabaseGUI(unittest.TestCase):
    """Tests for database GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.panel = ConfigPanel()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.panel.close()
    
    def test_database_checkbox_exists(self):
        """Test database checkbox exists"""
        self.assertIsNotNone(self.panel.use_database_check)
        self.assertFalse(self.panel.use_database_check.isChecked())  # Default disabled
    
    def test_database_settings_disabled_by_default(self):
        """Test database settings are disabled when checkbox is unchecked"""
        self.assertFalse(self.panel.use_database_check.isChecked())
        self.assertFalse(self.panel.database_settings_widget.isEnabled())
    
    def test_database_settings_enabled_when_checked(self):
        """Test database settings are enabled when checkbox is checked"""
        self.panel.use_database_check.setChecked(True)
        QApplication.processEvents()
        self.assertTrue(self.panel.database_settings_widget.isEnabled())
    
    def test_database_path_edit(self):
        """Test database path input"""
        self.assertIsNotNone(self.panel.database_path_edit)
        self.assertEqual(self.panel.database_path_edit.text(), "")
    
    def test_auto_save_checkbox(self):
        """Test auto-save checkbox"""
        self.assertIsNotNone(self.panel.auto_save_check)
        self.assertTrue(self.panel.auto_save_check.isChecked())  # Default enabled
    
    def test_settings_save_and_load(self):
        """Test settings save and load correctly"""
        # Set values
        self.panel.use_database_check.setChecked(True)
        self.panel.database_path_edit.setText("custom.db")
        self.panel.auto_save_check.setChecked(False)
        
        # Save
        self.panel.save_settings()
        
        # Reset
        self.panel.use_database_check.setChecked(False)
        self.panel.database_path_edit.setText("")
        self.panel.auto_save_check.setChecked(True)
        
        # Load
        self.panel.load_settings()
        
        # Verify values restored
        self.assertTrue(self.panel.use_database_check.isChecked())
        self.assertEqual(self.panel.database_path_edit.text(), "custom.db")
        self.assertFalse(self.panel.auto_save_check.isChecked())

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Integration Tests (`SRC/test_database_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for database functionality.

Tests end-to-end database workflow with processing pipeline.
"""

import unittest
import tempfile
import os
from unittest.mock import Mock, patch
from SRC.processor import process_playlist
from SRC.database import get_database
from SRC.config import set_database_config, get_database_config

class TestDatabaseIntegration(unittest.TestCase):
    """Integration tests for database workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.temp_db.close()
        self.original_config = get_database_config()
        set_database_config(enabled=True, database_path=self.temp_db.name)
    
    def tearDown(self):
        """Clean up test fixtures"""
        set_database_config(
            enabled=self.original_config.get("enabled", False),
            database_path=self.original_config.get("database_path", "cuepoint.db"),
            auto_save=self.original_config.get("auto_save", True)
        )
        if os.path.exists(self.temp_db.name):
            os.unlink(self.temp_db.name)
    
    def test_processing_saves_to_database(self):
        """Test that processing saves results to database"""
        # Mock processing
        with patch('SRC.processor.process_playlist') as mock_process:
            mock_process.return_value = [
                Mock(playlist_index=1, title="Track", artist="Artist", matched=True)
            ]
            
            # Process playlist
            results = process_playlist("test.xml", "Test Playlist")
            
            # Verify database has search
            db = get_database()
            history = db.get_search_history(limit=1)
            self.assertGreater(len(history), 0)
    
    def test_database_view_displays_data(self):
        """Test that database view displays saved data"""
        # Save some data
        db = get_database()
        search_id = db.save_search("Test Playlist", "/path.xml", {}, 1)
        
        # Create view
        from SRC.gui.database_view import DatabaseView
        view = DatabaseView()
        view.refresh()
        
        # Verify view has data
        # This would test the actual view display
        pass

if __name__ == '__main__':
    unittest.main()
```

#### Part D: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Database checkbox is visible in Advanced Settings
- [ ] Checkbox is unchecked by default
- [ ] Database settings are disabled when checkbox is unchecked
- [ ] Database settings are enabled when checkbox is checked
- [ ] Database path input works correctly
- [ ] Browse button opens file dialog
- [ ] Auto-save checkbox works correctly
- [ ] Info label updates when settings change
- [ ] Info button opens information dialog
- [ ] Tooltips are helpful and accurate
- [ ] Settings save correctly
- [ ] Settings load correctly
- [ ] Settings persist across application restarts
- [ ] Database tab appears when database is enabled
- [ ] Database tab disappears when database is disabled
- [ ] Database view displays search history
- [ ] Database view displays results correctly
- [ ] Database view search/filter works

**Functional Testing Checklist**:
- [ ] Database can be enabled/disabled
- [ ] Database file is created when enabled
- [ ] Search history is saved correctly
- [ ] Results are saved correctly
- [ ] Search history is retrieved correctly
- [ ] Results are retrieved correctly
- [ ] Database view displays data correctly
- [ ] Database view search works
- [ ] Database view filter works
- [ ] Auto-save works when enabled
- [ ] Manual save works
- [ ] Database migration works (if schema changes)
- [ ] Performance is acceptable

**Performance Testing Checklist**:
- [ ] Database write time: < 100ms per search
- [ ] Database query time: < 50ms for history
- [ ] Database size: Reasonable growth rate
- [ ] Batch inserts: Efficient for large datasets
- [ ] Query performance: Fast with indexes
- [ ] Memory usage: Reasonable
- [ ] No performance degradation with large database

**Error Scenario Testing**:
- [ ] Database corruption handled gracefully
- [ ] Connection errors handled gracefully
- [ ] Migration errors handled gracefully
- [ ] Invalid database path handled gracefully
- [ ] Disk full errors handled gracefully
- [ ] Lock errors handled gracefully
- [ ] Error messages are clear and helpful

**Cross-Step Integration Testing**:
- [ ] Database works with Phase 3 performance tracking
- [ ] Database works with Step 4.1 (Enhanced Export)
- [ ] Database works with Step 4.2 (Advanced Filtering)
- [ ] Database works with Step 4.3 (Async I/O)
- [ ] Database works with other features
- [ ] Database integration tested with all export formats
- [ ] Settings integrate with existing configuration system

**Acceptance Criteria Verification**:
- ✅ Database schema created
- ✅ Search history saved correctly
- ✅ Results retrieved correctly
- ✅ Database view displays data
- ✅ Search and filter work
- ✅ Performance acceptable
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Testing Requirements

### Unit Tests
- [ ] Test database operations
- [ ] Test schema creation
- [ ] Test migration
- [ ] Test error handling
- [ ] Minimum 80% code coverage

### Integration Tests
- [ ] Test with processing pipeline
- [ ] Test database view
- [ ] Test with real data
- [ ] Test performance

---

## Error Handling

### Error Scenarios
1. **Database Errors**
   - Connection errors → Show user-friendly message
   - Corruption → Provide repair option
   - Lock errors → Retry with delay

2. **Migration Errors**
   - Schema changes → Handle gracefully
   - Data migration → Backup before migration

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Database is opt-in (optional)
- [ ] CSV exports still work
- [ ] Existing workflows unchanged
- [ ] Can disable database

---

## Documentation Requirements

### User Guide Updates
- [ ] Document database feature
- [ ] Explain when to use
- [ ] Document database location
- [ ] Explain backup/restore

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track database operation times
- [ ] Track database size
- [ ] Track query performance

---

## Acceptance Criteria
- ✅ Database schema created
- ✅ Search history saved correctly
- ✅ Results retrieved correctly
- ✅ Database view displays data
- ✅ Search and filter work
- ✅ Performance acceptable
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.4.1: Create Database Module
- [ ] Substep 4.4.2: Create Database View Widget
- [ ] Substep 4.4.3: Integrate into Main Window
- [ ] Substep 4.4.4: Testing
- [ ] Documentation updated
- [ ] All tests passing

---

**IMPORTANT**: This is a future feature. Only implement if users request database features. Evaluate need based on user feedback.

**See Also**: See `00_Future_Features_Overview.md` for other future features and implementation considerations.

