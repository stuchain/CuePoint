# Step 6.12: Advanced Features

**Status**: 📝 Planned  
**Duration**: 2-3 weeks  
**Dependencies**: Steps 6.1-6.11 (All Previous UI Improvements)

## Goal

Add advanced features including statistics dashboard, notifications, processing queue, and real-time updates to enhance the application's capabilities and user experience.

## Overview

This step focuses on adding sophisticated features that provide deeper insights and better workflow management:
- Statistics dashboard with visual charts
- System notifications for completion/errors
- Processing queue with pause/resume
- Real-time updates for live match counts

---

## Substep 6.12.1: Statistics Dashboard

**Duration**: 1 week  
**Priority**: Medium

### Goal

Create a visual statistics dashboard showing match rates, processing trends, and success metrics over time.

### Implementation Details

#### 1. Visual Charts for Match Rates

**File**: `SRC/cuepoint/ui/widgets/statistics_dashboard.py` (NEW)

**Changes**:
- Create statistics dashboard widget
- Use matplotlib or PyQtChart for visualizations
- Display match rate charts (bar, pie, line)
- Show trends over time

**Chart Types**:
- **Pie Chart**: Match distribution (Matched/Unmatched/Review)
- **Bar Chart**: Match rates by playlist
- **Line Chart**: Match rate trends over time
- **Histogram**: Score distribution

**Dashboard Layout**:
```
┌─────────────────────────────────────┐
│  Statistics Dashboard               │
├─────────────────────────────────────┤
│  Overall Match Rate: 78%            │
│  [Pie Chart: Matched/Unmatched]    │
│                                     │
│  Match Rates by Playlist:           │
│  [Bar Chart]                        │
│                                     │
│  Match Rate Trends:                 │
│  [Line Chart over time]             │
│                                     │
│  Score Distribution:                │
│  [Histogram]                        │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class StatisticsDashboard(QWidget):
    """Statistics dashboard widget"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setup_ui()
        self.data = []
    
    def setup_ui(self):
        """Setup dashboard UI"""
        layout = QVBoxLayout(self)
        
        # Overall statistics
        stats_layout = QHBoxLayout()
        self.overall_label = QLabel("Overall Match Rate: --")
        stats_layout.addWidget(self.overall_label)
        layout.addLayout(stats_layout)
        
        # Charts
        charts_layout = QGridLayout()
        
        # Pie chart
        self.pie_chart = self._create_pie_chart()
        charts_layout.addWidget(self.pie_chart, 0, 0)
        
        # Bar chart
        self.bar_chart = self._create_bar_chart()
        charts_layout.addWidget(self.bar_chart, 0, 1)
        
        # Line chart
        self.line_chart = self._create_line_chart()
        charts_layout.addWidget(self.line_chart, 1, 0, 1, 2)
        
        layout.addLayout(charts_layout)
    
    def _create_pie_chart(self) -> QWidget:
        """Create pie chart widget"""
        # Using matplotlib or PyQtChart
        from matplotlib.figure import Figure
        from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg
        
        fig = Figure(figsize=(5, 4))
        canvas = FigureCanvasQTAgg(fig)
        ax = fig.add_subplot(111)
        
        # Pie chart data
        labels = ['Matched', 'Unmatched', 'Review Needed']
        sizes = [78, 15, 7]
        ax.pie(sizes, labels=labels, autopct='%1.1f%%')
        
        return canvas
    
    def update_statistics(self, data: List[Dict]):
        """Update dashboard with new data"""
        self.data = data
        self._update_charts()
    
    def _update_charts(self):
        """Update all charts with current data"""
        # Calculate statistics
        total = len(self.data)
        matched = sum(1 for d in self.data if d.get('matched', False))
        match_rate = (matched / total * 100) if total > 0 else 0
        
        # Update overall label
        self.overall_label.setText(f"Overall Match Rate: {match_rate:.1f}%")
        
        # Update charts
        self._update_pie_chart()
        self._update_bar_chart()
        self._update_line_chart()
```

**Chart Library Options**:
- **matplotlib**: Full-featured, good for complex charts
- **PyQtChart**: Native Qt charts, better integration
- **Plotly**: Interactive charts (requires web view)

#### 2. Processing Time Trends

**File**: `SRC/cuepoint/ui/widgets/statistics_dashboard.py` (MODIFY)

**Changes**:
- Track processing time per playlist/session
- Display trends over time
- Show average processing time
- Identify slow processing sessions

**Time Trend Chart**:
- X-axis: Date/Time
- Y-axis: Processing time (minutes)
- Line chart showing trend
- Average line overlay

**Implementation**:
```python
def _create_time_trend_chart(self) -> QWidget:
    """Create processing time trend chart"""
    # Get historical data
    history_data = self._load_processing_history()
    
    dates = [d['date'] for d in history_data]
    times = [d['processing_time'] for d in history_data]
    avg_time = sum(times) / len(times) if times else 0
    
    # Create line chart
    fig = Figure(figsize=(8, 4))
    canvas = FigureCanvasQTAgg(fig)
    ax = fig.add_subplot(111)
    
    ax.plot(dates, times, marker='o', label='Processing Time')
    ax.axhline(y=avg_time, color='r', linestyle='--', label=f'Average: {avg_time:.1f}m')
    ax.set_xlabel('Date')
    ax.set_ylabel('Processing Time (minutes)')
    ax.legend()
    ax.grid(True)
    
    return canvas
```

#### 3. Success Rate Over Time

**File**: `SRC/cuepoint/ui/widgets/statistics_dashboard.py` (MODIFY)

**Changes**:
- Track success rate (match rate) over time
- Show improvement or degradation trends
- Identify patterns (e.g., better matches on weekends)
- Compare to average

**Success Rate Chart**:
- X-axis: Date/Time
- Y-axis: Match rate (percentage)
- Line chart with trend line
- Average line overlay

**Implementation**:
```python
def _create_success_rate_chart(self) -> QWidget:
    """Create success rate over time chart"""
    # Get historical match rates
    history_data = self._load_processing_history()
    
    dates = [d['date'] for d in history_data]
    match_rates = [d['match_rate'] for d in history_data]
    avg_rate = sum(match_rates) / len(match_rates) if match_rates else 0
    
    # Create line chart
    fig = Figure(figsize=(8, 4))
    canvas = FigureCanvasQTAgg(fig)
    ax = fig.add_subplot(111)
    
    ax.plot(dates, match_rates, marker='o', label='Match Rate')
    ax.axhline(y=avg_rate, color='g', linestyle='--', label=f'Average: {avg_rate:.1f}%')
    ax.set_xlabel('Date')
    ax.set_ylabel('Match Rate (%)')
    ax.set_ylim(0, 100)
    ax.legend()
    ax.grid(True)
    
    return canvas
```

**Data Storage**:
- Store processing history in SQLite database or JSON file
- Include: date, processing time, match rate, track count
- Query for trends and statistics

### Testing Requirements

- [ ] Charts display correctly
- [ ] Statistics are calculated accurately
- [ ] Trends are visible and meaningful
- [ ] Dashboard updates with new data
- [ ] Charts are responsive and interactive
- [ ] Historical data is stored correctly

### Success Criteria

- Users can visualize their processing statistics
- Trends are clear and actionable
- Dashboard provides valuable insights
- Charts are visually appealing and informative

---

## Substep 6.12.2: System Notifications

**Duration**: 2-3 days  
**Priority**: Medium

### Goal

Notify users when processing completes or errors occur, even when the application is minimized.

### Implementation Details

#### 1. System Notifications on Completion

**File**: `SRC/cuepoint/ui/utils/notifications.py` (NEW)

**Changes**:
- Create notification service
- Use platform-specific notifications (Windows Toast, macOS Notification Center, Linux notify-send)
- Show notification when processing completes
- Include summary information

**Notification Content**:
- Title: "Processing Complete"
- Message: "95/120 tracks matched (79%)"
- Action: Click to open application
- Icon: Application icon

**Implementation**:
```python
class NotificationService:
    """System notification service"""
    
    def __init__(self):
        self.platform = platform.system()
    
    def show_notification(self, title: str, message: str, icon_path: str = None):
        """Show system notification"""
        if self.platform == "Windows":
            self._show_windows_notification(title, message, icon_path)
        elif self.platform == "Darwin":  # macOS
            self._show_macos_notification(title, message, icon_path)
        else:  # Linux
            self._show_linux_notification(title, message, icon_path)
    
    def _show_windows_notification(self, title: str, message: str, icon_path: str):
        """Show Windows toast notification"""
        try:
            from win10toast import ToastNotifier
            toaster = ToastNotifier()
            toaster.show_toast(
                title,
                message,
                icon_path=icon_path,
                duration=10,
                threaded=True
            )
        except ImportError:
            # Fallback to QSystemTrayIcon
            self._show_qt_notification(title, message, icon_path)
    
    def _show_macos_notification(self, title: str, message: str, icon_path: str):
        """Show macOS notification"""
        import subprocess
        script = f'''
        display notification "{message}" with title "{title}"
        '''
        subprocess.run(["osascript", "-e", script])
    
    def _show_linux_notification(self, title: str, message: str, icon_path: str):
        """Show Linux notification"""
        import subprocess
        cmd = ["notify-send", title, message]
        if icon_path:
            cmd.extend(["--icon", icon_path])
        subprocess.run(cmd)
    
    def _show_qt_notification(self, title: str, message: str, icon_path: str):
        """Fallback Qt notification using QSystemTrayIcon"""
        from PySide6.QtWidgets import QSystemTrayIcon
        from PySide6.QtGui import QIcon
        
        if not QSystemTrayIcon.isSystemTrayAvailable():
            return
        
        tray = QSystemTrayIcon()
        if icon_path:
            tray.setIcon(QIcon(icon_path))
        tray.show()
        tray.showMessage(title, message, QSystemTrayIcon.Information, 5000)
```

**Integration**:
```python
def on_processing_complete(self, results: List[TrackResult]):
    """Show notification when processing completes"""
    matched = sum(1 for r in results if r.matched)
    total = len(results)
    match_rate = (matched / total * 100) if total > 0 else 0
    
    notification_service = NotificationService()
    notification_service.show_notification(
        "Processing Complete",
        f"{matched}/{total} tracks matched ({match_rate:.0f}%)"
    )
```

#### 2. Sound Alerts for Completion/Errors

**File**: `SRC/cuepoint/ui/utils/notifications.py` (MODIFY)

**Changes**:
- Add sound alerts for completion and errors
- Use system sounds or custom sound files
- Configurable (enable/disable in settings)
- Different sounds for success/error

**Sound Implementation**:
```python
class SoundNotification:
    """Sound notification service"""
    
    def __init__(self):
        self.settings = QSettings()
        self.enabled = self.settings.value("sound_notifications", True, type=bool)
    
    def play_success_sound(self):
        """Play success sound"""
        if not self.enabled:
            return
        
        # Use QSound or platform-specific sound
        from PySide6.QtMultimedia import QSound
        
        sound_file = self.settings.value("success_sound", "default", type=str)
        if sound_file == "default":
            # Use system default success sound
            self._play_system_sound("success")
        else:
            sound = QSound(sound_file)
            sound.play()
    
    def play_error_sound(self):
        """Play error sound"""
        if not self.enabled:
            return
        
        sound_file = self.settings.value("error_sound", "default", type=str)
        if sound_file == "default":
            self._play_system_sound("error")
        else:
            sound = QSound(sound_file)
            sound.play()
    
    def _play_system_sound(self, sound_type: str):
        """Play system sound"""
        if platform.system() == "Windows":
            import winsound
            if sound_type == "success":
                winsound.MessageBeep(winsound.MB_OK)
            else:
                winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
```

**Settings Integration**:
- Add "Enable Sound Notifications" checkbox in settings
- Add sound file selection for custom sounds
- Test sound button in settings

### Testing Requirements

- [ ] Notifications appear on completion
- [ ] Notifications work when app is minimized
- [ ] Sound alerts play correctly
- [ ] Notifications are platform-appropriate
- [ ] Sound can be enabled/disabled
- [ ] Custom sounds work if configured

### Success Criteria

- Users are notified when processing completes
- Notifications work across platforms
- Sound alerts provide audio feedback
- Notifications are non-intrusive but noticeable

---

## Substep 6.12.3: Processing Queue

**Duration**: 1 week  
**Priority**: Low

### Goal

Allow users to queue multiple processing operations and manage them with pause/resume capabilities.

### Implementation Details

#### 1. Visual Queue of Pending Operations

**File**: `SRC/cuepoint/ui/widgets/processing_queue.py` (NEW)

**Changes**:
- Create processing queue widget
- Display queued operations
- Show operation status (Pending/Processing/Paused/Complete)
- Allow reordering (drag & drop)

**Queue Display**:
```
┌─────────────────────────────────────┐
│  Processing Queue                   │
├─────────────────────────────────────┤
│  → playlist1.xml - My Playlist 1    │
│    [Processing...] [Pause] [Remove]│
│                                     │
│  ⏳ playlist2.xml - My Playlist 2   │
│    [Pending] [Move Up] [Remove]     │
│                                     │
│  ⏸ playlist3.xml - My Playlist 3   │
│    [Paused] [Resume] [Remove]       │
│                                     │
│  ✓ playlist4.xml - My Playlist 4   │
│    [Complete] [Remove]              │
│                                     │
│  [Clear Completed]                  │
└─────────────────────────────────────┘
```

**Implementation**:
```python
class ProcessingQueueItem:
    """Represents a queued processing operation"""
    
    def __init__(self, xml_path: str, playlist_name: str):
        self.xml_path = xml_path
        self.playlist_name = playlist_name
        self.status = "pending"  # pending, processing, paused, complete, error
        self.progress = 0
        self.result = None

class ProcessingQueueWidget(QWidget):
    """Processing queue widget"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.queue_items = []
        self.setup_ui()
    
    def setup_ui(self):
        """Setup queue UI"""
        layout = QVBoxLayout(self)
        
        # Queue list
        self.queue_list = QListWidget()
        self.queue_list.setDragDropMode(QAbstractItemView.InternalMove)
        layout.addWidget(self.queue_list)
        
        # Buttons
        button_layout = QHBoxLayout()
        self.clear_completed_btn = QPushButton("Clear Completed")
        self.clear_completed_btn.clicked.connect(self.clear_completed)
        button_layout.addWidget(self.clear_completed_btn)
        layout.addLayout(button_layout)
    
    def add_to_queue(self, xml_path: str, playlist_name: str):
        """Add operation to queue"""
        item = ProcessingQueueItem(xml_path, playlist_name)
        self.queue_items.append(item)
        self._update_display()
    
    def _update_display(self):
        """Update queue display"""
        self.queue_list.clear()
        for item in self.queue_items:
            list_item = QListWidgetItem()
            widget = self._create_queue_item_widget(item)
            self.queue_list.addItem(list_item)
            self.queue_list.setItemWidget(list_item, widget)
```

#### 2. Pause/Resume Processing

**File**: `SRC/cuepoint/ui/widgets/processing_queue.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)

**Changes**:
- Add pause/resume functionality to controller
- Update queue UI when paused/resumed
- Save queue state
- Resume from pause point

**Pause/Resume Implementation**:
```python
class GUIController:
    """Extended controller with pause/resume"""
    
    def pause_processing(self):
        """Pause current processing"""
        if self.current_worker and self.current_worker.isRunning():
            self.current_worker.pause()
            self.processing_paused.emit()
    
    def resume_processing(self):
        """Resume paused processing"""
        if self.current_worker and self.current_worker.isPaused():
            self.current_worker.resume()
            self.processing_resumed.emit()

class ProcessingWorker(QThread):
    """Worker with pause/resume support"""
    
    def __init__(self):
        super().__init__()
        self._paused = False
        self._pause_condition = QWaitCondition()
        self._pause_mutex = QMutex()
    
    def pause(self):
        """Pause processing"""
        self._paused = True
    
    def resume(self):
        """Resume processing"""
        self._paused = False
        self._pause_condition.wakeAll()
    
    def isPaused(self) -> bool:
        """Check if paused"""
        return self._paused
    
    def run(self):
        """Run processing with pause support"""
        for track in tracks:
            # Check for pause
            self._pause_mutex.lock()
            if self._paused:
                self._pause_condition.wait(self._pause_mutex)
            self._pause_mutex.unlock()
            
            # Process track
            self.process_track(track)
```

**Queue Management**:
- Process queue items sequentially
- Auto-advance to next item on completion
- Allow manual pause/resume
- Show progress for current item

### Testing Requirements

- [ ] Queue displays pending operations
- [ ] Operations can be added to queue
- [ ] Queue items can be reordered
- [ ] Pause/resume works correctly
- [ ] Queue processes items sequentially
- [ ] Completed items can be cleared
- [ ] Queue state is saved

### Success Criteria

- Users can queue multiple operations
- Queue provides clear status for each operation
- Pause/resume allows workflow control
- Queue management is intuitive

---

## Substep 6.12.4: Real-time Updates

**Duration**: 3-4 days  
**Priority**: Medium

### Goal

Provide real-time updates for match counts and streaming results as they complete.

### Implementation Details

#### 1. Live Match Count Updates

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)

**Changes**:
- Update match counts in real-time during processing
- Show live statistics
- Update results table as matches are found
- Smooth animations for updates

**Live Updates Display**:
```
Processing: 45/120 tracks
Matched: 38 | Unmatched: 5 | Review: 2
[Live updating results table...]
```

**Implementation**:
```python
def on_progress_updated(self, progress_info: ProgressInfo):
    """Update results in real-time"""
    if progress_info.current_result:
        # Add new result to table immediately
        self._add_result_row(progress_info.current_result)
        
        # Update statistics
        self._update_live_statistics()
    
    # Update progress
    self.progress_bar.setValue(progress_info.completed_tracks)

def _update_live_statistics(self):
    """Update live statistics display"""
    matched = sum(1 for r in self.results if r.matched)
    unmatched = sum(1 for r in self.results if not r.matched)
    total = len(self.results)
    
    self.stats_label.setText(
        f"Matched: {matched} | Unmatched: {unmatched} | Total: {total}"
    )
```

#### 2. Streaming Results as They Complete

**File**: `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)  
**File**: `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)

**Changes**:
- Emit results as they are processed (not just at end)
- Update results view incrementally
- Show "streaming" indicator
- Auto-scroll to new results (optional)

**Streaming Implementation**:
```python
class ProcessingWorker(QThread):
    """Worker that streams results"""
    
    result_ready = Signal(TrackResult)  # Emit each result as ready
    
    def run(self):
        """Process and emit results as they complete"""
        for track in tracks:
            result = self.process_track(track)
            # Emit immediately
            self.result_ready.emit(result)
            
            # Also emit progress
            self.progress_updated.emit(progress_info)

def on_result_ready(self, result: TrackResult):
    """Handle individual result"""
    # Add to results view immediately
    self.results_view.add_result(result)
    
    # Update statistics
    self._update_statistics()
    
    # Optional: Auto-scroll
    if self.auto_scroll_enabled:
        self.results_view.scroll_to_bottom()
```

**Streaming Features**:
- Results appear as they are processed
- Live statistics update
- Optional auto-scroll to new results
- Visual indicator for "streaming" mode
- Pause streaming updates (optional)

**Visual Indicator**:
- "Live" badge on results tab
- Pulsing animation
- "Streaming results..." message

### Testing Requirements

- [ ] Match counts update in real-time
- [ ] Results appear as they are processed
- [ ] Statistics update correctly
- [ ] Streaming doesn't cause performance issues
- [ ] Auto-scroll works if enabled
- [ ] Streaming can be paused/resumed

### Success Criteria

- Users see results as they are processed
- Real-time updates provide immediate feedback
- Streaming doesn't impact performance
- Live updates enhance user experience

---

## Implementation Order

```
6.12.4 (Real-time Updates) - High impact, improves feedback
  ↓
6.12.2 (System Notifications) - Quick win, improves awareness
  ↓
6.12.1 (Statistics Dashboard) - Valuable insights
  ↓
6.12.3 (Processing Queue) - Advanced feature, lower priority
```

---

## Files to Create

- `SRC/cuepoint/ui/widgets/statistics_dashboard.py` (NEW)
- `SRC/cuepoint/ui/utils/notifications.py` (NEW)
- `SRC/cuepoint/ui/widgets/processing_queue.py` (NEW)

## Files to Modify

- `SRC/cuepoint/ui/main_window.py` (MODIFY)
- `SRC/cuepoint/ui/widgets/results_view.py` (MODIFY)
- `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)

---

## Testing Checklist

### Functional Testing
- [ ] Statistics dashboard displays correctly
- [ ] Charts are accurate and informative
- [ ] Notifications appear on completion
- [ ] Sound alerts work correctly
- [ ] Processing queue functions properly
- [ ] Pause/resume works
- [ ] Real-time updates work correctly
- [ ] Streaming results appear as processed

### User Experience Testing
- [ ] Dashboard provides valuable insights
- [ ] Notifications are helpful
- [ ] Queue management is intuitive
- [ ] Real-time updates enhance experience
- [ ] Features don't overwhelm users

### Performance Testing
- [ ] Dashboard doesn't slow down app
- [ ] Real-time updates are efficient
- [ ] Queue processing is smooth
- [ ] Notifications don't cause delays

---

## Success Criteria

- ✅ Statistics dashboard provides valuable insights
- ✅ Notifications keep users informed
- ✅ Processing queue enables workflow management
- ✅ Real-time updates provide immediate feedback
- ✅ Advanced features enhance overall experience

---

**Phase 6 Complete**: All UI restructuring and improvements are now documented and ready for implementation.

