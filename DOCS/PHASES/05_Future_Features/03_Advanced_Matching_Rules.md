# Step 4.6: Advanced Matching Rules (OPTIONAL)

**Status**: 📝 Planned (Evaluate Need Based on User Requests)  
**Priority**: 🚀 Medium Priority (Only if users request improved matching)  
**Estimated Duration**: 3-4 days  
**Dependencies**: Phase 0 (matcher), Phase 3 (performance monitoring)

## Goal
Enhance matching algorithm with advanced rules including genre matching, label matching, and configurable BPM tolerance to improve match quality.

## Success Criteria
- [ ] Genre matching bonus implemented
- [ ] Label matching bonus implemented
- [ ] Configurable BPM tolerance
- [ ] Matching rules configurable
- [ ] Performance impact acceptable
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: Basic matching algorithm (title, artist, year, key, BPM)
- **Limitations**: No genre/label consideration, strict BPM matching
- **Opportunity**: Improve match quality with additional signals
- **Risk**: May slow down matching, need to validate improvements

### Feature Design
- **Genre Matching**: Bonus score when genres match
- **Label Matching**: Bonus score when labels match
- **BPM Tolerance**: Configurable ±BPM range for matching
- **Configurable Rules**: Enable/disable rules, adjust weights

### Performance Considerations (Phase 3 Integration)
- **Matching Time**: Track impact on matching performance
- **Match Quality**: Track improvement in match rates
- **Metrics to Track**:
  - Matching time with rules enabled
  - Match rate improvement
  - Rule effectiveness

---

## Implementation Steps

### Substep 4.9.1: Add Genre Matching (1 day)
**File**: `SRC/matcher.py` (MODIFY)

**What to implement:**

```python
def calculate_genre_bonus(
    track_genres: List[str],
    candidate_genres: List[str]
) -> float:
    """
    Calculate genre matching bonus.
    
    Args:
        track_genres: Genres from Rekordbox track
        candidate_genres: Genres from Beatport candidate
    
    Returns:
        Bonus score (0-5)
    """
    if not track_genres or not candidate_genres:
        return 0.0
    
    # Normalize genres
    track_set = {g.lower().strip() for g in track_genres}
    candidate_set = {g.lower().strip() for g in candidate_genres}
    
    # Calculate overlap
    overlap = len(track_set & candidate_set)
    total = len(track_set | candidate_set)
    
    if total == 0:
        return 0.0
    
    # Bonus: 0-5 based on overlap ratio
    overlap_ratio = overlap / total
    return overlap_ratio * 5.0
```

**Implementation Checklist**:
- [ ] Add genre bonus calculation
- [ ] Integrate into scoring
- [ ] Add configuration option
- [ ] Test genre matching

---

### Substep 4.9.2: Add Label Matching (1 day)
**File**: `SRC/matcher.py` (MODIFY)

**What to implement:**

```python
def calculate_label_bonus(
    track_label: Optional[str],
    candidate_label: Optional[str]
) -> float:
    """
    Calculate label matching bonus.
    
    Args:
        track_label: Label from Rekordbox track
        candidate_label: Label from Beatport candidate
    
    Returns:
        Bonus score (0-3)
    """
    if not track_label or not candidate_label:
        return 0.0
    
    # Normalize labels
    track_norm = track_label.lower().strip()
    candidate_norm = candidate_label.lower().strip()
    
    # Exact match
    if track_norm == candidate_norm:
        return 3.0
    
    # Partial match (one contains the other)
    if track_norm in candidate_norm or candidate_norm in track_norm:
        return 1.0
    
    return 0.0
```

**Implementation Checklist**:
- [ ] Add label bonus calculation
- [ ] Integrate into scoring
- [ ] Add configuration option
- [ ] Test label matching

---

### Substep 4.9.3: Add BPM Tolerance (1 day)
**File**: `SRC/matcher.py` (MODIFY), `SRC/config.py` (MODIFY)

**What to implement:**

```python
# In config.py
BPM_TOLERANCE = 2  # Default ±2 BPM

# In matcher.py
def bpm_matches(
    track_bpm: Optional[float],
    candidate_bpm: Optional[float],
    tolerance: int = 2
) -> bool:
    """
    Check if BPMs match within tolerance.
    
    Args:
        track_bpm: BPM from Rekordbox track
        candidate_bpm: BPM from Beatport candidate
        tolerance: Allowed BPM difference
    
    Returns:
        True if BPMs match within tolerance
    """
    if not track_bpm or not candidate_bpm:
        return False
    
    try:
        track = float(track_bpm)
        candidate = float(candidate_bpm)
        return abs(track - candidate) <= tolerance
    except (ValueError, TypeError):
        return False
```

**Implementation Checklist**:
- [ ] Add BPM tolerance configuration
- [ ] Update BPM matching logic
- [ ] Add to scoring
- [ ] Test BPM tolerance

---

### Substep 4.6.4: Add Configuration UI Integration (1-2 days)
**Files**: `SRC/config.py` (MODIFY), `SRC/gui/config_panel.py` (MODIFY)

**Dependencies**: Phase 1 Step 1.3 (config panel exists), Substep 4.6.1 (genre matching), Substep 4.6.2 (label matching), Substep 4.6.3 (BPM tolerance)

**What to implement - EXACT STRUCTURE:**

#### Part A: Configuration Module Updates

**In `SRC/config.py`:**

```python
# Advanced Matching Rules Configuration
ENABLE_GENRE_MATCHING = True  # Default enabled
ENABLE_LABEL_MATCHING = True  # Default enabled
BPM_TOLERANCE = 2  # Default ±2 BPM tolerance
GENRE_MATCHING_WEIGHT = 5.0  # Maximum bonus score for genre match
LABEL_MATCHING_WEIGHT = 3.0  # Maximum bonus score for label match

def get_matching_rules_config() -> Dict[str, Any]:
    """Get advanced matching rules configuration"""
    return {
        "enable_genre_matching": ENABLE_GENRE_MATCHING,
        "enable_label_matching": ENABLE_LABEL_MATCHING,
        "bpm_tolerance": BPM_TOLERANCE,
        "genre_matching_weight": GENRE_MATCHING_WEIGHT,
        "label_matching_weight": LABEL_MATCHING_WEIGHT
    }

def set_matching_rules_config(
    enable_genre: bool = True,
    enable_label: bool = True,
    bpm_tolerance: int = 2,
    genre_weight: float = 5.0,
    label_weight: float = 3.0
):
    """Set advanced matching rules configuration"""
    global ENABLE_GENRE_MATCHING, ENABLE_LABEL_MATCHING, BPM_TOLERANCE
    global GENRE_MATCHING_WEIGHT, LABEL_MATCHING_WEIGHT
    ENABLE_GENRE_MATCHING = enable_genre
    ENABLE_LABEL_MATCHING = enable_label
    BPM_TOLERANCE = bpm_tolerance
    GENRE_MATCHING_WEIGHT = genre_weight
    LABEL_MATCHING_WEIGHT = label_weight
```

#### Part B: GUI Configuration Panel Integration

**In `SRC/gui/config_panel.py`:**

```python
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox, QCheckBox,
    QSpinBox, QDoubleSpinBox, QLabel, QPushButton, QMessageBox
)
from PySide6.QtCore import Qt
from SRC.config import get_matching_rules_config, set_matching_rules_config

class ConfigPanel(QWidget):
    """Configuration panel with advanced matching rules"""
    
    def init_ui(self):
        """Initialize configuration UI"""
        layout = QVBoxLayout(self)
        
        # ... existing configuration groups ...
        
        # NEW: Advanced Matching Rules Group (in Advanced Settings)
        matching_group = QGroupBox("Advanced Matching Rules")
        matching_group.setCheckable(False)
        matching_layout = QVBoxLayout()
        
        # Info label
        info_label = QLabel(
            "Configure advanced matching rules to improve match quality. "
            "These rules add bonus scores when certain criteria match."
        )
        info_label.setWordWrap(True)
        info_label.setStyleSheet("color: gray; font-style: italic;")
        matching_layout.addWidget(info_label)
        
        # Enable genre matching
        self.genre_matching_check = QCheckBox("Enable genre matching bonus")
        self.genre_matching_check.setChecked(True)
        self.genre_matching_check.setToolTip(
            "Add bonus score when track genres match candidate genres.\n"
            "Improves matching for tracks with genre information.\n"
            "Recommended: Enabled for better match quality."
        )
        matching_layout.addWidget(self.genre_matching_check)
        
        # Genre matching weight (enabled when checkbox is checked)
        genre_weight_layout = QHBoxLayout()
        genre_weight_layout.addWidget(QLabel("  Genre Bonus Weight:"))
        self.genre_weight_spin = QDoubleSpinBox()
        self.genre_weight_spin.setMinimum(0.0)
        self.genre_weight_spin.setMaximum(10.0)
        self.genre_weight_spin.setValue(5.0)
        self.genre_weight_spin.setSingleStep(0.5)
        self.genre_weight_spin.setToolTip(
            "Maximum bonus score for genre matching (0-10).\n"
            "Higher values = more weight given to genre matches.\n"
            "Recommended: 3-7 for most cases."
        )
        genre_weight_layout.addWidget(self.genre_weight_spin)
        genre_weight_layout.addStretch()
        matching_layout.addLayout(genre_weight_layout)
        
        # Enable label matching
        self.label_matching_check = QCheckBox("Enable label matching bonus")
        self.label_matching_check.setChecked(True)
        self.label_matching_check.setToolTip(
            "Add bonus score when track label matches candidate label.\n"
            "Improves matching for tracks with label information.\n"
            "Recommended: Enabled for better match quality."
        )
        matching_layout.addWidget(self.label_matching_check)
        
        # Label matching weight (enabled when checkbox is checked)
        label_weight_layout = QHBoxLayout()
        label_weight_layout.addWidget(QLabel("  Label Bonus Weight:"))
        self.label_weight_spin = QDoubleSpinBox()
        self.label_weight_spin.setMinimum(0.0)
        self.label_weight_spin.setMaximum(10.0)
        self.label_weight_spin.setValue(3.0)
        self.label_weight_spin.setSingleStep(0.5)
        self.label_weight_spin.setToolTip(
            "Maximum bonus score for label matching (0-10).\n"
            "Higher values = more weight given to label matches.\n"
            "Recommended: 2-5 for most cases."
        )
        label_weight_layout.addWidget(self.label_weight_spin)
        label_weight_layout.addStretch()
        matching_layout.addLayout(label_weight_layout)
        
        # BPM tolerance
        bpm_layout = QHBoxLayout()
        bpm_layout.addWidget(QLabel("BPM Tolerance (±):"))
        self.bpm_tolerance_spin = QSpinBox()
        self.bpm_tolerance_spin.setMinimum(0)
        self.bpm_tolerance_spin.setMaximum(10)
        self.bpm_tolerance_spin.setValue(2)
        self.bpm_tolerance_spin.setSuffix(" BPM")
        self.bpm_tolerance_spin.setToolTip(
            "Allowed BPM difference for matching.\n"
            "Tracks within ±BPM tolerance are considered for matching.\n"
            "Higher values = more lenient BPM matching.\n"
            "Recommended: 1-3 for most cases."
        )
        bpm_layout.addWidget(self.bpm_tolerance_spin)
        bpm_layout.addStretch()
        matching_layout.addLayout(bpm_layout)
        
        # Reset to defaults button
        reset_button = QPushButton("Reset to Defaults")
        reset_button.setToolTip("Reset all matching rules to default values")
        reset_button.clicked.connect(self.reset_matching_rules)
        matching_layout.addWidget(reset_button)
        
        # Info button
        info_button = QPushButton("ℹ️ About Matching Rules")
        info_button.setToolTip("Show information about advanced matching rules")
        info_button.clicked.connect(self.show_matching_rules_info)
        matching_layout.addWidget(info_button)
        
        matching_group.setLayout(matching_layout)
        layout.addWidget(matching_group)
        
        # Connect signals
        self.genre_matching_check.toggled.connect(
            lambda checked: self.genre_weight_spin.setEnabled(checked)
        )
        self.label_matching_check.toggled.connect(
            lambda checked: self.label_weight_spin.setEnabled(checked)
        )
    
    def reset_matching_rules(self):
        """Reset matching rules to default values"""
        self.genre_matching_check.setChecked(True)
        self.genre_weight_spin.setValue(5.0)
        self.label_matching_check.setChecked(True)
        self.label_weight_spin.setValue(3.0)
        self.bpm_tolerance_spin.setValue(2)
    
    def show_matching_rules_info(self):
        """Show information dialog about matching rules"""
        info_text = """
<h3>Advanced Matching Rules Information</h3>

<p><b>What are Advanced Matching Rules?</b></p>
<p>Advanced matching rules add bonus scores to candidates when certain criteria match, 
improving the overall match quality and accuracy.</p>

<p><b>Genre Matching Bonus:</b></p>
<ul>
<li>Adds bonus score when track genres match candidate genres</li>
<li>Uses genre overlap ratio to calculate bonus (0 to max weight)</li>
<li>Example: Track with "House, Deep House" matches candidate with "House" → bonus applied</li>
<li>Recommended: Enabled with weight 3-7</li>
</ul>

<p><b>Label Matching Bonus:</b></p>
<ul>
<li>Adds bonus score when track label matches candidate label</li>
<li>Exact match required (case-insensitive)</li>
<li>Example: Track from "Defected Records" matches candidate from "Defected Records" → bonus applied</li>
<li>Recommended: Enabled with weight 2-5</li>
</ul>

<p><b>BPM Tolerance:</b></p>
<ul>
<li>Allows BPM difference for matching</li>
<li>Tracks within ±BPM tolerance are considered</li>
<li>Example: Track BPM 128 matches candidate BPM 130 with tolerance 2 → considered</li>
<li>Recommended: 1-3 BPM for most cases</li>
</ul>

<p><b>How It Works:</b></p>
<ul>
<li>Base matching score is calculated first (title, artist, etc.)</li>
<li>Bonus scores are added for matching rules</li>
<li>Final score = base score + genre bonus + label bonus</li>
<li>BPM tolerance filters candidates before scoring</li>
</ul>

<p><b>Performance Impact:</b></p>
<ul>
<li>Genre/Label matching: Minimal impact (< 5% slower)</li>
<li>BPM tolerance: No performance impact (filtering only)</li>
<li>Overall: Negligible performance impact</li>
</ul>

<p><b>When to Adjust:</b></p>
<ul>
<li>Lower match rates → Enable/enhance rules</li>
<li>Too many false positives → Lower weights or disable rules</li>
<li>Specific genre/label matching needed → Adjust weights</li>
</ul>
"""
        
        msg = QMessageBox(self)
        msg.setWindowTitle("Advanced Matching Rules Information")
        msg.setTextFormat(Qt.RichText)
        msg.setText(info_text)
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec()
    
    def get_settings(self) -> Dict[str, Any]:
        """Get all settings including matching rules"""
        settings = {
            # ... existing settings ...
            "enable_genre_matching": self.genre_matching_check.isChecked(),
            "enable_label_matching": self.label_matching_check.isChecked(),
            "bpm_tolerance": self.bpm_tolerance_spin.value(),
            "genre_matching_weight": self.genre_weight_spin.value(),
            "label_matching_weight": self.label_weight_spin.value(),
        }
        return settings
    
    def load_settings(self):
        """Load settings from config"""
        from SRC.config import get_matching_rules_config
        
        config = get_matching_rules_config()
        self.genre_matching_check.setChecked(config.get("enable_genre_matching", True))
        self.genre_weight_spin.setValue(config.get("genre_matching_weight", 5.0))
        self.label_matching_check.setChecked(config.get("enable_label_matching", True))
        self.label_weight_spin.setValue(config.get("label_matching_weight", 3.0))
        self.bpm_tolerance_spin.setValue(config.get("bpm_tolerance", 2))
        
        # Update widget states
        self.genre_weight_spin.setEnabled(self.genre_matching_check.isChecked())
        self.label_weight_spin.setEnabled(self.label_matching_check.isChecked())
    
    def save_settings(self):
        """Save settings to config"""
        from SRC.config import set_matching_rules_config
        
        set_matching_rules_config(
            enable_genre=self.genre_matching_check.isChecked(),
            enable_label=self.label_matching_check.isChecked(),
            bpm_tolerance=self.bpm_tolerance_spin.value(),
            genre_weight=self.genre_weight_spin.value(),
            label_weight=self.label_weight_spin.value()
        )
```

**Implementation Checklist**:
- [ ] Add matching rules configuration to config.py
- [ ] Add matching rules settings group to config panel
- [ ] Add genre matching checkbox and weight spinbox
- [ ] Add label matching checkbox and weight spinbox
- [ ] Add BPM tolerance spinbox
- [ ] Add reset to defaults button
- [ ] Add info dialog button
- [ ] Connect signals for dynamic updates
- [ ] Add settings loading/saving
- [ ] Test configuration persistence
- [ ] Test UI interactions

---

## Comprehensive Testing (2-3 days)

**Dependencies**: All previous substeps must be completed

#### Part A: Unit Tests (`SRC/test_advanced_matching.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for advanced matching rules.

Tests genre matching, label matching, BPM tolerance, and rule combinations.
"""

import unittest
from SRC.matcher import (
    calculate_genre_bonus, calculate_label_bonus,
    apply_bpm_tolerance, score_candidate_with_rules
)
from SRC.matcher import BeatportCandidate

class TestAdvancedMatching(unittest.TestCase):
    """Comprehensive tests for advanced matching functionality"""
    
    def test_genre_matching_exact_match(self):
        """Test genre matching with exact match"""
        track_genres = ["House", "Deep House"]
        candidate_genres = ["House", "Deep House"]
        
        bonus = calculate_genre_bonus(track_genres, candidate_genres)
        self.assertEqual(bonus, 5.0)  # 100% overlap = max bonus
    
    def test_genre_matching_partial_match(self):
        """Test genre matching with partial match"""
        track_genres = ["House", "Deep House", "Tech House"]
        candidate_genres = ["House", "Deep House"]
        
        bonus = calculate_genre_bonus(track_genres, candidate_genres)
        # 2 out of 3 genres match = 2/3 overlap = ~3.33 bonus
        self.assertGreater(bonus, 3.0)
        self.assertLess(bonus, 4.0)
    
    def test_genre_matching_no_match(self):
        """Test genre matching with no match"""
        track_genres = ["House"]
        candidate_genres = ["Techno"]
        
        bonus = calculate_genre_bonus(track_genres, candidate_genres)
        self.assertEqual(bonus, 0.0)
    
    def test_genre_matching_case_insensitive(self):
        """Test genre matching is case-insensitive"""
        track_genres = ["HOUSE", "deep house"]
        candidate_genres = ["House", "Deep House"]
        
        bonus = calculate_genre_bonus(track_genres, candidate_genres)
        self.assertGreater(bonus, 0.0)
    
    def test_genre_matching_empty_lists(self):
        """Test genre matching with empty lists"""
        bonus1 = calculate_genre_bonus([], ["House"])
        bonus2 = calculate_genre_bonus(["House"], [])
        bonus3 = calculate_genre_bonus([], [])
        
        self.assertEqual(bonus1, 0.0)
        self.assertEqual(bonus2, 0.0)
        self.assertEqual(bonus3, 0.0)
    
    def test_label_matching_exact_match(self):
        """Test label matching with exact match"""
        track_label = "Defected Records"
        candidate_label = "Defected Records"
        
        bonus = calculate_label_bonus(track_label, candidate_label)
        self.assertEqual(bonus, 3.0)  # Exact match = max bonus
    
    def test_label_matching_case_insensitive(self):
        """Test label matching is case-insensitive"""
        track_label = "DEFECTED RECORDS"
        candidate_label = "Defected Records"
        
        bonus = calculate_label_bonus(track_label, candidate_label)
        self.assertEqual(bonus, 3.0)
    
    def test_label_matching_no_match(self):
        """Test label matching with no match"""
        track_label = "Defected Records"
        candidate_label = "Spinnin' Records"
        
        bonus = calculate_label_bonus(track_label, candidate_label)
        self.assertEqual(bonus, 0.0)
    
    def test_label_matching_empty_values(self):
        """Test label matching with empty values"""
        bonus1 = calculate_label_bonus("", "Defected Records")
        bonus2 = calculate_label_bonus("Defected Records", "")
        bonus3 = calculate_label_bonus(None, "Defected Records")
        
        self.assertEqual(bonus1, 0.0)
        self.assertEqual(bonus2, 0.0)
        self.assertEqual(bonus3, 0.0)
    
    def test_bpm_tolerance_within_range(self):
        """Test BPM tolerance with values within range"""
        track_bpm = 128
        candidate_bpm = 130
        tolerance = 2
        
        result = apply_bpm_tolerance(track_bpm, candidate_bpm, tolerance)
        self.assertTrue(result)  # 128 vs 130 with tolerance 2 = within range
    
    def test_bpm_tolerance_outside_range(self):
        """Test BPM tolerance with values outside range"""
        track_bpm = 128
        candidate_bpm = 135
        tolerance = 2
        
        result = apply_bpm_tolerance(track_bpm, candidate_bpm, tolerance)
        self.assertFalse(result)  # 128 vs 135 with tolerance 2 = outside range
    
    def test_bpm_tolerance_exact_match(self):
        """Test BPM tolerance with exact match"""
        track_bpm = 128
        candidate_bpm = 128
        tolerance = 2
        
        result = apply_bpm_tolerance(track_bpm, candidate_bpm, tolerance)
        self.assertTrue(result)
    
    def test_bpm_tolerance_zero_tolerance(self):
        """Test BPM tolerance with zero tolerance"""
        track_bpm = 128
        candidate_bpm = 129
        tolerance = 0
        
        result = apply_bpm_tolerance(track_bpm, candidate_bpm, tolerance)
        self.assertFalse(result)  # Zero tolerance = exact match only
    
    def test_bpm_tolerance_string_bpm(self):
        """Test BPM tolerance with string BPM values"""
        track_bpm = "128"
        candidate_bpm = "130"
        tolerance = 2
        
        result = apply_bpm_tolerance(track_bpm, candidate_bpm, tolerance)
        self.assertTrue(result)
    
    def test_scoring_with_all_rules(self):
        """Test candidate scoring with all rules enabled"""
        candidate = BeatportCandidate(
            beatport_title="Test Track",
            beatport_artists="Test Artist",
            beatport_bpm="128",
            beatport_key="C Major",
            beatport_genres=["House", "Deep House"],
            beatport_label="Defected Records"
        )
        
        track_title = "Test Track"
        track_artists = "Test Artist"
        track_genres = ["House"]
        track_label = "Defected Records"
        
        score = score_candidate_with_rules(
            candidate=candidate,
            track_title=track_title,
            track_artists=track_artists,
            track_genres=track_genres,
            track_label=track_label,
            enable_genre=True,
            enable_label=True,
            genre_weight=5.0,
            label_weight=3.0
        )
        
        # Should have base score + genre bonus + label bonus
        self.assertGreater(score, 0.0)
    
    def test_scoring_with_rules_disabled(self):
        """Test candidate scoring with rules disabled"""
        candidate = BeatportCandidate(
            beatport_title="Test Track",
            beatport_artists="Test Artist",
            beatport_genres=["House"],
            beatport_label="Defected Records"
        )
        
        score_with_rules = score_candidate_with_rules(
            candidate=candidate,
            track_title="Test Track",
            track_artists="Test Artist",
            track_genres=["House"],
            track_label="Defected Records",
            enable_genre=True,
            enable_label=True,
            genre_weight=5.0,
            label_weight=3.0
        )
        
        score_without_rules = score_candidate_with_rules(
            candidate=candidate,
            track_title="Test Track",
            track_artists="Test Artist",
            track_genres=["House"],
            track_label="Defected Records",
            enable_genre=False,
            enable_label=False,
            genre_weight=5.0,
            label_weight=3.0
        )
        
        # Score with rules should be higher
        self.assertGreater(score_with_rules, score_without_rules)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: GUI Integration Tests (`SRC/test_matching_rules_gui.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GUI integration tests for advanced matching rules configuration.

Tests UI interactions and settings persistence.
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

class TestMatchingRulesGUI(unittest.TestCase):
    """Tests for matching rules GUI components"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.panel = ConfigPanel()
    
    def tearDown(self):
        """Clean up test fixtures"""
        self.panel.close()
    
    def test_genre_matching_checkbox(self):
        """Test genre matching checkbox"""
        self.assertIsNotNone(self.panel.genre_matching_check)
        self.assertTrue(self.panel.genre_matching_check.isChecked())  # Default enabled
    
    def test_label_matching_checkbox(self):
        """Test label matching checkbox"""
        self.assertIsNotNone(self.panel.label_matching_check)
        self.assertTrue(self.panel.label_matching_check.isChecked())  # Default enabled
    
    def test_genre_weight_spinbox(self):
        """Test genre weight spinbox"""
        self.assertIsNotNone(self.panel.genre_weight_spin)
        self.assertEqual(self.panel.genre_weight_spin.value(), 5.0)  # Default
        self.assertEqual(self.panel.genre_weight_spin.minimum(), 0.0)
        self.assertEqual(self.panel.genre_weight_spin.maximum(), 10.0)
    
    def test_label_weight_spinbox(self):
        """Test label weight spinbox"""
        self.assertIsNotNone(self.panel.label_weight_spin)
        self.assertEqual(self.panel.label_weight_spin.value(), 3.0)  # Default
        self.assertEqual(self.panel.label_weight_spin.minimum(), 0.0)
        self.assertEqual(self.panel.label_weight_spin.maximum(), 10.0)
    
    def test_bpm_tolerance_spinbox(self):
        """Test BPM tolerance spinbox"""
        self.assertIsNotNone(self.panel.bpm_tolerance_spin)
        self.assertEqual(self.panel.bpm_tolerance_spin.value(), 2)  # Default
        self.assertEqual(self.panel.bpm_tolerance_spin.minimum(), 0)
        self.assertEqual(self.panel.bpm_tolerance_spin.maximum(), 10)
    
    def test_genre_weight_enabled_when_checked(self):
        """Test genre weight is enabled when checkbox is checked"""
        self.panel.genre_matching_check.setChecked(True)
        QApplication.processEvents()
        self.assertTrue(self.panel.genre_weight_spin.isEnabled())
    
    def test_genre_weight_disabled_when_unchecked(self):
        """Test genre weight is disabled when checkbox is unchecked"""
        self.panel.genre_matching_check.setChecked(False)
        QApplication.processEvents()
        self.assertFalse(self.panel.genre_weight_spin.isEnabled())
    
    def test_reset_to_defaults(self):
        """Test reset to defaults button"""
        # Change values
        self.panel.genre_matching_check.setChecked(False)
        self.panel.genre_weight_spin.setValue(10.0)
        self.panel.label_matching_check.setChecked(False)
        self.panel.label_weight_spin.setValue(10.0)
        self.panel.bpm_tolerance_spin.setValue(5)
        
        # Reset
        self.panel.reset_matching_rules()
        
        # Verify defaults restored
        self.assertTrue(self.panel.genre_matching_check.isChecked())
        self.assertEqual(self.panel.genre_weight_spin.value(), 5.0)
        self.assertTrue(self.panel.label_matching_check.isChecked())
        self.assertEqual(self.panel.label_weight_spin.value(), 3.0)
        self.assertEqual(self.panel.bpm_tolerance_spin.value(), 2)
    
    def test_settings_save_and_load(self):
        """Test settings save and load correctly"""
        # Set values
        self.panel.genre_matching_check.setChecked(False)
        self.panel.genre_weight_spin.setValue(7.0)
        self.panel.label_matching_check.setChecked(True)
        self.panel.label_weight_spin.setValue(4.0)
        self.panel.bpm_tolerance_spin.setValue(3)
        
        # Save
        self.panel.save_settings()
        
        # Reset
        self.panel.genre_matching_check.setChecked(True)
        self.panel.genre_weight_spin.setValue(5.0)
        self.panel.label_matching_check.setChecked(True)
        self.panel.label_weight_spin.setValue(3.0)
        self.panel.bpm_tolerance_spin.setValue(2)
        
        # Load
        self.panel.load_settings()
        
        # Verify values restored
        self.assertFalse(self.panel.genre_matching_check.isChecked())
        self.assertEqual(self.panel.genre_weight_spin.value(), 7.0)
        self.assertTrue(self.panel.label_matching_check.isChecked())
        self.assertEqual(self.panel.label_weight_spin.value(), 4.0)
        self.assertEqual(self.panel.bpm_tolerance_spin.value(), 3)

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Integration Tests (`SRC/test_matching_rules_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for advanced matching rules.

Tests end-to-end matching with rules enabled/disabled.
"""

import unittest
from unittest.mock import Mock, patch
from SRC.matcher import best_beatport_match
from SRC.config import set_matching_rules_config, get_matching_rules_config

class TestMatchingRulesIntegration(unittest.TestCase):
    """Integration tests for matching rules workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.original_config = get_matching_rules_config()
    
    def tearDown(self):
        """Clean up test fixtures"""
        set_matching_rules_config(
            enable_genre=self.original_config.get("enable_genre_matching", True),
            enable_label=self.original_config.get("enable_label_matching", True),
            bpm_tolerance=self.original_config.get("bpm_tolerance", 2),
            genre_weight=self.original_config.get("genre_matching_weight", 5.0),
            label_weight=self.original_config.get("label_matching_weight", 3.0)
        )
    
    def test_matching_with_rules_enabled(self):
        """Test matching with all rules enabled"""
        set_matching_rules_config(enable_genre=True, enable_label=True, bpm_tolerance=2)
        
        # Test matching with rules
        # This would test actual matching behavior
        pass
    
    def test_matching_with_rules_disabled(self):
        """Test matching with rules disabled"""
        set_matching_rules_config(enable_genre=False, enable_label=False, bpm_tolerance=0)
        
        # Test matching without rules
        # This would test actual matching behavior
        pass
    
    def test_match_quality_improvement(self):
        """Test that rules improve match quality"""
        # Compare match rates with/without rules
        # This would require real test data
        pass

if __name__ == '__main__':
    unittest.main()
```

#### Part D: Manual Testing Checklist

**UI Testing Checklist**:
- [ ] Matching rules group is visible in Advanced Settings
- [ ] Genre matching checkbox is visible and works
- [ ] Genre weight spinbox is visible and works
- [ ] Genre weight is enabled/disabled based on checkbox
- [ ] Label matching checkbox is visible and works
- [ ] Label weight spinbox is visible and works
- [ ] Label weight is enabled/disabled based on checkbox
- [ ] BPM tolerance spinbox is visible and works
- [ ] Reset to defaults button works
- [ ] Info button opens information dialog
- [ ] Tooltips are helpful and accurate
- [ ] Settings save correctly
- [ ] Settings load correctly
- [ ] Settings persist across application restarts

**Functional Testing Checklist**:
- [ ] Genre matching can be enabled/disabled
- [ ] Genre matching adds bonus when genres match
- [ ] Genre matching weight affects bonus amount
- [ ] Label matching can be enabled/disabled
- [ ] Label matching adds bonus when labels match
- [ ] Label matching weight affects bonus amount
- [ ] BPM tolerance filters candidates correctly
- [ ] BPM tolerance value affects matching range
- [ ] All rules work together correctly
- [ ] Rules improve match quality
- [ ] Performance impact is acceptable (< 5% slower)

**Performance Testing Checklist**:
- [ ] Matching with rules enabled: < 5% slower
- [ ] Genre matching calculation: < 1ms per candidate
- [ ] Label matching calculation: < 1ms per candidate
- [ ] BPM tolerance filtering: No performance impact
- [ ] Memory usage is reasonable
- [ ] No performance degradation with large playlists

**Error Scenario Testing**:
- [ ] Missing genres handled gracefully
- [ ] Missing labels handled gracefully
- [ ] Invalid BPM values handled gracefully
- [ ] Empty genre/label lists handled gracefully
- [ ] Invalid weight values handled gracefully
- [ ] Configuration errors handled gracefully

**Cross-Step Integration Testing**:
- [ ] Matching rules work with Phase 3 performance tracking
- [ ] Matching rules work with Step 4.1 (Enhanced Export)
- [ ] Matching rules work with Step 4.2 (Advanced Filtering)
- [ ] Matching rules work with Step 4.3 (Async I/O)
- [ ] Matching rules work with Step 4.4 (Traxsource)
- [ ] Settings integrate with existing configuration system

**Acceptance Criteria Verification**:
- ✅ Genre matching works
- ✅ Label matching works
- ✅ BPM tolerance works
- ✅ Rules configurable
- ✅ Performance acceptable
- ✅ UI is intuitive and helpful
- ✅ All tests passing
- ✅ Manual testing complete

---

## Error Handling

### Error Scenarios
1. **Missing Data**: Handle missing genres/labels gracefully
2. **Invalid Data**: Handle invalid BPM values
3. **Configuration Errors**: Validate configuration values

---

## Backward Compatibility

### Compatibility Requirements
- [ ] Default behavior unchanged (rules disabled by default or conservative defaults)
- [ ] Existing matches still work
- [ ] No breaking changes

---

## Documentation Requirements

### User Guide Updates
- [ ] Document matching rules
- [ ] Explain when to use each rule
- [ ] Provide examples

---

## Phase 3 Integration

### Performance Metrics
- [ ] Track matching time with rules
- [ ] Track match rate improvement
- [ ] Track rule effectiveness

---

## Acceptance Criteria
- ✅ Genre matching works
- ✅ Label matching works
- ✅ BPM tolerance works
- ✅ Rules configurable
- ✅ Performance acceptable
- ✅ All tests passing

---

## Implementation Checklist Summary
- [ ] Substep 4.9.1: Add Genre Matching
- [ ] Substep 4.9.2: Add Label Matching
- [ ] Substep 4.9.3: Add BPM Tolerance
- [ ] Substep 4.9.4: Add Configuration UI
- [ ] Testing
- [ ] Documentation updated

---

**IMPORTANT**: Only implement this step if users request improved matching or if match rates are low.

**Next Step**: After evaluation, proceed to other Phase 4 steps or Phase 5.

