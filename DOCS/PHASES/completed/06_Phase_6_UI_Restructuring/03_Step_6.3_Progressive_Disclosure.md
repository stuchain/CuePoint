# Step 6.3: Implement Progressive Disclosure

**Status**: 📝 Planned  
**Duration**: 2-3 days  
**Dependencies**: Step 6.2 (XML Selection with Info Button)

## Goal

Implement progressive disclosure so that UI elements appear only when needed:
- Processing mode selection appears ONLY after XML file is selected
- Playlist selection appears ONLY after processing mode is selected

## Implementation

### 1. Modify MainWindow for Progressive Disclosure

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Update the `init_ui` method to hide sections initially:

```python
def init_ui(self) -> None:
    """Initialize all UI components and layout."""
    # ... existing code for window setup ...

    # File selection section
    file_group = QGroupBox("File Selection")
    file_layout = QVBoxLayout()
    self.file_selector = FileSelector()
    self.file_selector.file_selected.connect(self.on_file_selected)
    file_layout.addWidget(self.file_selector)
    file_group.setLayout(file_layout)
    top_section_layout.addWidget(file_group)

    # Processing mode selection - HIDDEN INITIALLY
    mode_group = QGroupBox("Processing Mode")
    mode_layout = QHBoxLayout()
    self.mode_button_group = QButtonGroup()

    self.single_mode_radio = QRadioButton("Single Playlist")
    self.single_mode_radio.setChecked(True)
    self.single_mode_radio.toggled.connect(self.on_mode_changed)
    self.mode_button_group.addButton(self.single_mode_radio, 0)
    mode_layout.addWidget(self.single_mode_radio)

    self.batch_mode_radio = QRadioButton("Multiple Playlists")
    self.batch_mode_radio.toggled.connect(self.on_mode_changed)
    self.mode_button_group.addButton(self.batch_mode_radio, 1)
    mode_layout.addWidget(self.batch_mode_radio)

    mode_layout.addStretch()
    mode_group.setLayout(mode_layout)
    mode_group.setVisible(False)  # HIDDEN INITIALLY
    self.mode_group = mode_group  # Store reference
    top_section_layout.addWidget(mode_group)

    # Single playlist selection section - HIDDEN INITIALLY
    self.single_playlist_group = QGroupBox("Playlist Selection")
    single_playlist_layout = QVBoxLayout()
    self.playlist_selector = PlaylistSelector()
    self.playlist_selector.playlist_selected.connect(self.on_playlist_selected)
    single_playlist_layout.addWidget(self.playlist_selector)
    self.single_playlist_group.setLayout(single_playlist_layout)
    self.single_playlist_group.setVisible(False)  # HIDDEN INITIALLY
    top_section_layout.addWidget(self.single_playlist_group)

    # Batch processor widget - HIDDEN INITIALLY
    self.batch_processor = BatchProcessorWidget()
    self.batch_processor.setVisible(False)
    top_section_layout.addWidget(self.batch_processor)

    # Start Processing button container - HIDDEN INITIALLY
    self.start_button_container = QWidget()
    self.start_button_layout = QHBoxLayout(self.start_button_container)
    self.start_button_layout.addStretch()
    self.start_button = QPushButton("Start Processing")
    self.start_button.setMinimumHeight(40)
    self.start_button.clicked.connect(self.start_processing)
    self.start_button.setEnabled(False)  # DISABLED INITIALLY
    self.start_button_layout.addWidget(self.start_button)
    self.start_button_layout.addStretch()
    self.start_button_container.setVisible(False)  # HIDDEN INITIALLY
    top_section_layout.addWidget(self.start_button_container)
```

### 2. Update on_file_selected Method

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Modify to show processing mode after file is selected:

```python
def on_file_selected(self, file_path: str) -> None:
    """Handle file selection from FileSelector widget."""
    if self.file_selector.validate_file(file_path):
        self.statusBar().showMessage(f"Loading XML file: {os.path.basename(file_path)}...")
        try:
            # Load playlists into playlist selector
            self.playlist_selector.load_xml_file(file_path)
            playlist_count = len(self.playlist_selector.playlists)
            self.statusBar().showMessage(f"File loaded: {playlist_count} playlists found")

            # Update batch processor with playlists
            self.batch_processor.set_playlists(list(self.playlist_selector.playlists.keys()))

            # SHOW PROCESSING MODE SELECTION
            self.mode_group.setVisible(True)

            # Save to recent files
            self.save_recent_file(file_path)
        except Exception as e:
            self.statusBar().showMessage(f"Error loading XML: {str(e)}")
            # Hide processing mode if error
            self.mode_group.setVisible(False)
    else:
        self.statusBar().showMessage(f"Invalid file: {file_path}")
        # Clear playlist selector if file is invalid
        self.playlist_selector.clear()
        self.batch_processor.set_playlists([])
        # HIDE PROCESSING MODE
        self.mode_group.setVisible(False)
        # HIDE PLAYLIST SELECTION
        self.single_playlist_group.setVisible(False)
        self.start_button_container.setVisible(False)
        self.start_button.setEnabled(False)
```

### 3. Update on_mode_changed Method

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Modify to show playlist selection after mode is selected:

```python
def on_mode_changed(self) -> None:
    """Handle processing mode change between single and batch modes."""
    is_batch_mode = self.batch_mode_radio.isChecked()

    # Show/hide single playlist UI
    self.single_playlist_group.setVisible(not is_batch_mode)
    self.start_button_container.setVisible(not is_batch_mode)

    # Show/hide batch processor
    self.batch_processor.setVisible(is_batch_mode)

    # ENABLE START BUTTON if mode is selected
    if is_batch_mode:
        # Batch mode - button enabled by batch processor
        pass
    else:
        # Single mode - enable button, but it will be enabled/disabled based on playlist selection
        self.start_button_container.setVisible(True)
        # Button will be enabled when playlist is selected (handled in on_playlist_selected)

    # Update batch processor with playlists if file is already loaded
    if is_batch_mode and hasattr(self.playlist_selector, "playlists"):
        playlists = list(self.playlist_selector.playlists.keys())
        self.batch_processor.set_playlists(playlists)

    # Update status bar
    mode_text = "Multiple Playlists" if is_batch_mode else "Single Playlist"
    self.statusBar().showMessage(f"Mode: {mode_text}")
```

### 4. Update on_playlist_selected Method

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Modify to enable start button when playlist is selected:

```python
def on_playlist_selected(self, playlist_name: str) -> None:
    """Handle playlist selection from PlaylistSelector widget."""
    if playlist_name:
        track_count = self.playlist_selector.get_playlist_track_count(playlist_name)
        self.statusBar().showMessage(
            f"Selected playlist: {playlist_name} ({track_count} tracks)"
        )
        # ENABLE START BUTTON when playlist is selected
        self.start_button.setEnabled(True)
        # Ensure start button container is visible
        self.start_button_container.setVisible(True)
    else:
        # DISABLE START BUTTON if no playlist selected
        self.start_button.setEnabled(False)
```

## State Management Summary

### Initial State
- ✅ File selection: **Visible**
- ❌ Processing mode: **Hidden**
- ❌ Playlist selection: **Hidden**
- ❌ Start button: **Hidden & Disabled**

### After XML File Selected
- ✅ File selection: **Visible**
- ✅ Processing mode: **Visible**
- ❌ Playlist selection: **Hidden**
- ❌ Start button: **Hidden & Disabled**

### After Processing Mode Selected
- ✅ File selection: **Visible**
- ✅ Processing mode: **Visible**
- ✅ Playlist selection: **Visible** (single mode) or Batch processor (batch mode)
- ⚠️ Start button: **Visible** but **Disabled** (single mode) or handled by batch processor (batch mode)

### After Playlist Selected (Single Mode)
- ✅ File selection: **Visible**
- ✅ Processing mode: **Visible**
- ✅ Playlist selection: **Visible**
- ✅ Start button: **Visible & Enabled**

## Testing Checklist

- [ ] Processing mode is hidden initially
- [ ] Processing mode appears after valid XML file is selected
- [ ] Processing mode hides if invalid file is selected
- [ ] Playlist selection is hidden initially
- [ ] Playlist selection appears after processing mode is selected
- [ ] Start button is hidden and disabled initially
- [ ] Start button appears after processing mode is selected
- [ ] Start button is enabled only after playlist is selected (single mode)
- [ ] Batch mode shows batch processor instead of playlist selector
- [ ] All state transitions work smoothly

## Acceptance Criteria

- ✅ Progressive disclosure works as specified
- ✅ UI elements appear in the correct order
- ✅ No UI elements appear before their prerequisites are met
- ✅ State management is clear and consistent
- ✅ User experience is intuitive

