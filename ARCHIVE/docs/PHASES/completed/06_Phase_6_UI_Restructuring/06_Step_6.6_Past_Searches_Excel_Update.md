# Step 6.6: Fix Past Searches Excel Update

**Status**: 📝 Planned  
**Duration**: 2-3 days  
**Dependencies**: None (can be done in parallel)

## Goal

When a user selects a different candidate in the past searches view, update the Excel (CSV) file immediately and keep the user on the same page (don't navigate away).

## Implementation

### 1. Update _on_candidate_selected Method

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Modify to save CSV file immediately after candidate selection:

```python
def _on_candidate_selected(
    self,
    row: int,
    playlist_index: int,
    original_title: str,
    original_artists: str,
    candidate: Dict[str, Any],
):
    """Handle candidate selection - update the CSV row and table display"""
    if row < 0 or row >= len(self.filtered_rows):
        return

    try:
        # Get the filtered row
        filtered_row = self.filtered_rows[row]

        # Find the corresponding row in csv_rows by matching key fields
        csv_row = None
        for csv_r in self.csv_rows:
            if (
                csv_r.get("playlist_index") == filtered_row.get("playlist_index")
                and csv_r.get("original_title", "").strip()
                == filtered_row.get("original_title", "").strip()
                and csv_r.get("original_artists", "").strip()
                == filtered_row.get("original_artists", "").strip()
            ):
                csv_row = csv_r
                break

        if csv_row is None:
            QMessageBox.warning(self, "Error", "Could not find row to update")
            return

        # Update match information
        csv_row["beatport_title"] = candidate.get(
            "candidate_title", candidate.get("beatport_title", "")
        )
        csv_row["beatport_artists"] = candidate.get(
            "candidate_artists", candidate.get("beatport_artists", "")
        )
        csv_row["beatport_url"] = candidate.get("beatport_url", candidate.get("candidate_url", ""))
        csv_row["beatport_key"] = candidate.get("beatport_key", candidate.get("candidate_key", ""))
        csv_row["beatport_key_camelot"] = candidate.get(
            "beatport_key_camelot", candidate.get("candidate_key_camelot", "")
        )
        csv_row["beatport_year"] = candidate.get(
            "beatport_year", candidate.get("candidate_year", "")
        )
        csv_row["beatport_bpm"] = candidate.get("beatport_bpm", candidate.get("candidate_bpm", ""))
        csv_row["beatport_label"] = candidate.get(
            "beatport_label", candidate.get("candidate_label", "")
        )
        csv_row["title_sim"] = str(candidate.get("title_sim", ""))
        csv_row["artist_sim"] = str(candidate.get("artist_sim", ""))
        csv_row["match_score"] = str(candidate.get("match_score", candidate.get("final_score", "")))

        # Update confidence based on score
        try:
            score = float(csv_row.get("match_score", 0))
            if score >= 90:
                csv_row["confidence"] = "high"
            elif score >= 75:
                csv_row["confidence"] = "medium"
            else:
                csv_row["confidence"] = "low"
        except (ValueError, TypeError):
            csv_row["confidence"] = ""

        # Update candidate_index if available
        csv_row["candidate_index"] = candidate.get("candidate_index", "")

        # SAVE CSV FILE IMMEDIATELY
        if self.current_csv_path:
            self._save_csv_file(self.current_csv_path)

        # Re-apply filters to update the display
        self.apply_filters()

        # Update the table row to reflect changes
        self._update_table_row(row, csv_row)

        # Show confirmation (non-blocking, stays on page)
        from PySide6.QtWidgets import QMessageBox
        QMessageBox.information(
            self,
            "Candidate Updated",
            f"Updated match for:\n{original_title} - {original_artists}\n\nChanges saved to file.",
        )

    except Exception as e:
        import traceback
        error_msg = f"Error updating candidate: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        QMessageBox.critical(self, "Error", error_msg)
```

### 2. Add _save_csv_file Method

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Add method to save CSV file:

```python
def _save_csv_file(self, file_path: str) -> bool:
    """Save CSV file with current data"""
    if not file_path or not self.csv_rows:
        return False

    try:
        # Determine if file is compressed
        is_compressed = file_path.endswith('.gz')
        actual_path = file_path[:-3] if is_compressed else file_path

        # Get all column names from csv_rows
        if not self.csv_rows:
            return False

        # Get all unique keys from all rows
        all_keys = set()
        for row in self.csv_rows:
            all_keys.update(row.keys())

        # Sort keys for consistent column order
        fieldnames = sorted(all_keys)

        # Write CSV file
        if is_compressed:
            import gzip
            with gzip.open(file_path, 'wt', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(self.csv_rows)
        else:
            with open(file_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(self.csv_rows)

        return True

    except Exception as e:
        import traceback
        error_msg = f"Error saving CSV file: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        QMessageBox.critical(
            self,
            "Error Saving File",
            f"Could not save changes to file:\n{error_msg}"
        )
        return False
```

### 3. Update _update_table_row Method

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Ensure table row is updated correctly:

```python
def _update_table_row(self, row: int, csv_row: dict):
    """Update a specific row in the table with new CSV data"""
    if row < 0 or row >= self.table.rowCount():
        return

    # Find columns by header name
    for col in range(self.table.columnCount()):
        header = self.table.horizontalHeaderItem(col)
        if header:
            col_name = header.text()
            # Map column names to CSV row keys
            value = ""
            if col_name == "Beatport Title":
                value = csv_row.get("beatport_title", "")
            elif col_name == "Beatport Artist" or col_name == "Beatport Artists":
                value = csv_row.get("beatport_artists", "")
            elif col_name == "Score":
                value = csv_row.get("match_score", "")
            elif col_name == "Confidence":
                value = csv_row.get("confidence", "").capitalize()
            elif col_name == "Key":
                value = csv_row.get("beatport_key", "")
            elif col_name == "BPM":
                value = csv_row.get("beatport_bpm", "")
            elif col_name == "Year":
                value = csv_row.get("beatport_year", "")
            elif col_name == "Label":
                value = csv_row.get("beatport_label", "")
            elif col_name == "URL":
                value = csv_row.get("beatport_url", "")
            # Add more mappings as needed

            # Update table item
            item = self.table.item(row, col)
            if item:
                item.setText(str(value))
            else:
                item = QTableWidgetItem(str(value))
                self.table.setItem(row, col, item)
```

### 4. Ensure User Stays on Page

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Make sure dialog doesn't cause navigation:

```python
# In _on_candidate_selected, after showing message box:
# The message box is modal but doesn't navigate away
# After it's closed, user remains on the same page

# Ensure table selection is maintained
if row < self.table.rowCount():
    self.table.selectRow(row)
    # Scroll to row to keep it visible
    self.table.scrollToItem(self.table.item(row, 0))
```

## Testing Checklist

- [ ] Selecting a candidate updates the CSV file immediately
- [ ] CSV file is saved correctly with updated data
- [ ] Table display is updated to show new candidate
- [ ] User stays on the same page after selection
- [ ] No navigation occurs after candidate selection
- [ ] Error handling works if file can't be saved
- [ ] Compressed CSV files (.gz) are handled correctly
- [ ] All candidate fields are saved correctly
- [ ] Table row is visually updated

## Acceptance Criteria

- ✅ CSV file is updated immediately when candidate is selected
- ✅ User remains on the same page after selection
- ✅ Table display reflects the updated candidate
- ✅ No navigation or page changes occur
- ✅ Error handling works correctly
- ✅ Both regular and compressed CSV files work

