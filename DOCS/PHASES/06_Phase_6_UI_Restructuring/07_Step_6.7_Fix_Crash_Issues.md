# Step 6.7: Fix Cancel and Candidate Selection Crashes

**Status**: 📝 Planned  
**Duration**: 2-3 days  
**Dependencies**: Steps 6.4 (Progress Bar) and 6.6 (Past Searches)

## Goal

Fix all crash issues related to:
1. Cancel button during processing
2. Candidate selection in past searches

## Common Crash Causes

### Cancel Button Crashes
- Thread/worker not properly cleaned up
- Signal/slot connections not disconnected
- UI updates from non-main thread
- Race conditions during cancellation

### Candidate Selection Crashes
- File I/O errors not handled
- Table index out of bounds
- CSV parsing errors
- Thread safety issues

## Implementation

### 1. Fix Cancel Button Crashes

**File**: `SRC/cuepoint/ui/main_window.py` (MODIFY)

Improve cancel handling with proper cleanup:

```python
def on_cancel_requested(self) -> None:
    """Handle cancel button click from ProgressWidget."""
    try:
        # Prevent multiple cancel requests
        if hasattr(self, '_cancelling') and self._cancelling:
            return
        
        self._cancelling = True
        
        # Disable cancel button immediately
        self.progress_widget.cancel_button.setEnabled(False)
        self.progress_widget.cancel_button.setText("Cancelling...")
        
        # Cancel processing in a safe way
        if hasattr(self.controller, 'is_processing') and self.controller.is_processing():
            try:
                self.controller.cancel_processing()
            except Exception as e:
                print(f"Error in controller.cancel_processing: {e}")
                import traceback
                traceback.print_exc()
        
        self.statusBar().showMessage("Cancelling processing...")
        
        # Use QTimer to safely reset UI after cancellation
        from PySide6.QtCore import QTimer
        QTimer.singleShot(1000, self._on_cancel_complete)
        
    except Exception as e:
        import traceback
        error_msg = f"Error cancelling processing: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        self.statusBar().showMessage(error_msg, 5000)
        # Still try to reset UI
        QTimer.singleShot(500, self._on_cancel_complete)

def _on_cancel_complete(self) -> None:
    """Called after cancellation is complete - safely reset UI"""
    try:
        self._cancelling = False
        
        # Re-enable start button
        if hasattr(self, 'start_button'):
            self.start_button.setEnabled(True)
        
        # Reset cancel button
        if hasattr(self, 'progress_widget'):
            if hasattr(self.progress_widget, 'cancel_button'):
                self.progress_widget.cancel_button.setEnabled(True)
                self.progress_widget.cancel_button.setText("Cancel Processing")
            self.progress_widget.set_enabled(False)
        
        # Hide progress section
        if hasattr(self, 'progress_group'):
            self.progress_group.setVisible(False)
        
        self.statusBar().showMessage("Processing cancelled", 2000)
        
    except Exception as e:
        import traceback
        print(f"Error in cancel complete: {e}")
        print(traceback.format_exc())
        # Try to at least show a message
        try:
            self.statusBar().showMessage("Processing cancelled (with errors)", 3000)
        except:
            pass
```

**File**: `SRC/cuepoint/ui/controllers/main_controller.py` (MODIFY)

Ensure controller handles cancellation safely:

```python
def cancel_processing(self) -> None:
    """Cancel the current processing operation."""
    try:
        if hasattr(self, '_worker') and self._worker:
            # Set cancellation flag
            if hasattr(self._worker, 'cancel'):
                self._worker.cancel()
            
            # Wait for worker to finish (with timeout)
            if hasattr(self._worker, 'wait'):
                self._worker.wait(5000)  # 5 second timeout
            
            # Clean up worker
            if hasattr(self._worker, 'deleteLater'):
                self._worker.deleteLater()
            
            self._worker = None
        
        # Emit cancellation signal
        if hasattr(self, 'processing_cancelled'):
            self.processing_cancelled.emit()
            
    except Exception as e:
        import traceback
        print(f"Error in cancel_processing: {e}")
        print(traceback.format_exc())
        # Still try to clean up
        try:
            self._worker = None
        except:
            pass
```

### 2. Fix Candidate Selection Crashes

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Add comprehensive error handling:

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
    try:
        # Validate inputs
        if row < 0:
            QMessageBox.warning(self, "Error", "Invalid row number")
            return
        
        if not candidate:
            QMessageBox.warning(self, "Error", "No candidate data provided")
            return

        if row >= len(self.filtered_rows):
            QMessageBox.warning(self, "Error", "Row index out of bounds")
            return

        # Get the filtered row
        filtered_row = self.filtered_rows[row]

        # Find the corresponding row in csv_rows by matching key fields
        csv_row = None
        for csv_r in self.csv_rows:
            try:
                if (
                    csv_r.get("playlist_index") == filtered_row.get("playlist_index")
                    and csv_r.get("original_title", "").strip()
                    == filtered_row.get("original_title", "").strip()
                    and csv_r.get("original_artists", "").strip()
                    == filtered_row.get("original_artists", "").strip()
                ):
                    csv_row = csv_r
                    break
            except Exception as e:
                print(f"Error comparing rows: {e}")
                continue

        if csv_row is None:
            QMessageBox.warning(self, "Error", "Could not find row to update")
            return

        # Update match information (with error handling for each field)
        try:
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
        except Exception as e:
            print(f"Error updating CSV row fields: {e}")
            import traceback
            traceback.print_exc()

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

        # SAVE CSV FILE IMMEDIATELY (with error handling)
        if self.current_csv_path:
            if not self._save_csv_file(self.current_csv_path):
                # If save failed, show error but don't crash
                QMessageBox.warning(
                    self,
                    "Save Warning",
                    "Candidate was updated but could not be saved to file. "
                    "Please try saving manually."
                )

        # Re-apply filters to update the display
        try:
            self.apply_filters()
        except Exception as e:
            print(f"Error applying filters: {e}")
            import traceback
            traceback.print_exc()

        # Update the table row to reflect changes
        try:
            self._update_table_row(row, csv_row)
        except Exception as e:
            print(f"Error updating table row: {e}")
            import traceback
            traceback.print_exc()

        # Show confirmation (non-blocking, stays on page)
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
        QMessageBox.critical(
            self,
            "Error",
            f"An error occurred while updating the candidate:\n\n{error_msg}\n\n"
            "Please try again or report this issue."
        )
```

### 3. Add Thread Safety Checks

**File**: `SRC/cuepoint/ui/widgets/history_view.py` (MODIFY)

Ensure UI updates happen on main thread:

```python
def _update_table_row(self, row: int, csv_row: dict):
    """Update a specific row in the table with new CSV data"""
    try:
        # Validate row index
        if row < 0 or row >= self.table.rowCount():
            print(f"Invalid row index: {row}, table has {self.table.rowCount()} rows")
            return

        # Ensure we're on the main thread
        from PySide6.QtCore import QThread
        if QThread.currentThread() != self.thread():
            # Schedule update on main thread
            from PySide6.QtCore import QTimer
            QTimer.singleShot(0, lambda: self._update_table_row(row, csv_row))
            return

        # ... rest of update code ...
        
    except Exception as e:
        import traceback
        print(f"Error in _update_table_row: {e}")
        print(traceback.format_exc())
```

## Testing Checklist

### Cancel Button
- [ ] Cancel button works without crashes
- [ ] Multiple cancel clicks are handled gracefully
- [ ] UI is properly reset after cancellation
- [ ] No thread/worker leaks after cancellation
- [ ] Error handling works for edge cases

### Candidate Selection
- [ ] Candidate selection works without crashes
- [ ] Invalid row indices are handled
- [ ] File I/O errors are handled gracefully
- [ ] Table updates work correctly
- [ ] CSV file saves correctly
- [ ] Error messages are user-friendly

### General
- [ ] No crashes in normal operation
- [ ] Error messages are informative
- [ ] Application remains stable after errors
- [ ] Thread safety is maintained

## Acceptance Criteria

- ✅ Cancel button never causes crashes
- ✅ Candidate selection never causes crashes
- ✅ All errors are handled gracefully
- ✅ User-friendly error messages are shown
- ✅ Application remains stable
- ✅ No memory leaks or thread issues

## Debugging Tips

1. **Enable detailed logging**: Add print statements or use logging module
2. **Test edge cases**: Empty data, invalid indices, file permission errors
3. **Use try-except blocks**: Catch all exceptions, log them, show user-friendly messages
4. **Test thread safety**: Ensure UI updates happen on main thread
5. **Test file I/O**: Handle file locked, permission denied, disk full scenarios

