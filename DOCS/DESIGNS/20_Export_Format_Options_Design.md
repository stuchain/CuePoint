# Design: Export Format Options

**Number**: 20  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - High Priority  
**Effort**: 2-3 days  
**Impact**: Medium - User convenience  
**Phase**: 2 (GUI User Experience)

---

## 1. Overview

### 1.1 Problem Statement

Users need to export results in different formats for different use cases:
- **CSV**: Standard spreadsheet format (default)
- **JSON**: For API integration or programmatic processing
- **Excel**: For advanced spreadsheet features (.xlsx)
- **PDF**: For formatted reports or sharing

Currently, only CSV export is available, limiting flexibility.

### 1.2 Solution Overview

Implement a comprehensive export system that:
1. **Multiple formats**: CSV, JSON, Excel, PDF
2. **Column selection**: Choose which columns to export
3. **Filter integration**: Export filtered results
4. **Custom options**: Format-specific options (e.g., Excel styling)
5. **Progress indicator**: Show export progress for large datasets
6. **Destination selection**: Choose where to save files

---

## 2. Architecture Design

### 2.1 Export Dialog Flow

```
User clicks "Export" button
    ↓
Export Dialog opens
    ├─ Format selection (CSV, JSON, Excel, PDF)
    ├─ Column selection (checkboxes)
    ├─ Filter options (export filtered/all)
    ├─ Destination selection
    └─ Export button
        ↓
    Export processing
        ├─ Show progress
        └─ Show completion message
```

### 2.2 Export Pipeline

```
Selected Results (TrackResult objects)
    ↓
Format Converter
    ├─ CSV Writer
    ├─ JSON Writer
    ├─ Excel Writer
    └─ PDF Writer
    ↓
File Saved
```

---

## 3. Implementation Details

### 3.1 Export Dialog

**Location**: `SRC/gui/export_dialog.py` (NEW)

**Dialog Design**:

```python
# SRC/gui/export_dialog.py
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QComboBox, QCheckBox, QPushButton, QFileDialog,
    QGroupBox, QListWidget, QListWidgetItem, QProgressBar
)
from PySide6.QtCore import Qt, Signal

class ExportDialog(QDialog):
    """Export dialog for results"""
    
    export_complete = Signal(str)  # Emit file path when complete
    
    def __init__(self, results: List[TrackResult], parent=None):
        super().__init__(parent)
        self.results = results
        self.selected_columns = []
        self._setup_ui()
    
    def _setup_ui(self):
        """Set up dialog UI"""
        self.setWindowTitle("Export Results")
        self.setMinimumSize(600, 500)
        
        layout = QVBoxLayout()
        
        # Format selection
        format_group = QGroupBox("Export Format")
        format_layout = QVBoxLayout()
        
        self.format_combo = QComboBox()
        self.format_combo.addItems(["CSV", "JSON", "Excel (.xlsx)", "PDF"])
        self.format_combo.currentTextChanged.connect(self._on_format_changed)
        format_layout.addWidget(self.format_combo)
        
        format_group.setLayout(format_layout)
        layout.addWidget(format_group)
        
        # Column selection
        column_group = QGroupBox("Columns to Export")
        column_layout = QVBoxLayout()
        
        self.column_list = QListWidget()
        self.column_list.setSelectionMode(QListWidget.MultiSelection)
        
        # Add all columns
        for col_def in COLUMNS:
            if not col_def.get('hidden', False):
                item = QListWidgetItem(col_def['label'])
                item.setData(Qt.UserRole, col_def['key'])
                item.setCheckState(Qt.Checked)
                self.column_list.addItem(item)
        
        column_layout.addWidget(self.column_list)
        
        # Select All / Deselect All buttons
        button_layout = QHBoxLayout()
        select_all_btn = QPushButton("Select All")
        select_all_btn.clicked.connect(self._select_all_columns)
        deselect_all_btn = QPushButton("Deselect All")
        deselect_all_btn.clicked.connect(self._deselect_all_columns)
        button_layout.addWidget(select_all_btn)
        button_layout.addWidget(deselect_all_btn)
        column_layout.addLayout(button_layout)
        
        column_group.setLayout(column_layout)
        layout.addWidget(column_group)
        
        # Export options
        options_group = QGroupBox("Export Options")
        options_layout = QVBoxLayout()
        
        self.filtered_only_check = QCheckBox("Export filtered results only")
        self.filtered_only_check.setChecked(False)
        options_layout.addWidget(self.filtered_only_check)
        
        self.include_candidates_check = QCheckBox("Include candidates data")
        self.include_candidates_check.setChecked(False)
        options_layout.addWidget(self.include_candidates_check)
        
        self.include_queries_check = QCheckBox("Include queries data")
        self.include_queries_check.setChecked(False)
        options_layout.addWidget(self.include_queries_check)
        
        options_group.setLayout(options_layout)
        layout.addWidget(options_group)
        
        # Destination selection
        dest_layout = QHBoxLayout()
        dest_label = QLabel("Save to:")
        dest_layout.addWidget(dest_label)
        
        self.dest_path = QLineEdit()
        self.dest_path.setPlaceholderText("Select destination folder...")
        dest_layout.addWidget(self.dest_path)
        
        browse_btn = QPushButton("Browse...")
        browse_btn.clicked.connect(self._browse_destination)
        dest_layout.addWidget(browse_btn)
        
        layout.addLayout(dest_layout)
        
        # Progress bar (initially hidden)
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)
        
        # Buttons
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        export_btn = QPushButton("Export")
        export_btn.clicked.connect(self._do_export)
        button_layout.addWidget(export_btn)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def _on_format_changed(self, format_name: str):
        """Handle format change"""
        # Update file extension hint
        extensions = {
            "CSV": ".csv",
            "JSON": ".json",
            "Excel (.xlsx)": ".xlsx",
            "PDF": ".pdf"
        }
        # Update UI hints based on format
        pass
    
    def _select_all_columns(self):
        """Select all columns"""
        for i in range(self.column_list.count()):
            self.column_list.item(i).setCheckState(Qt.Checked)
    
    def _deselect_all_columns(self):
        """Deselect all columns"""
        for i in range(self.column_list.count()):
            self.column_list.item(i).setCheckState(Qt.Unchecked)
    
    def _browse_destination(self):
        """Browse for destination folder"""
        format_name = self.format_combo.currentText()
        extensions = {
            "CSV": "*.csv",
            "JSON": "*.json",
            "Excel (.xlsx)": "*.xlsx",
            "PDF": "*.pdf"
        }
        
        ext = extensions.get(format_name, "*.*")
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Export As",
            "",
            f"{format_name} Files ({ext});;All Files (*.*)"
        )
        
        if file_path:
            self.dest_path.setText(file_path)
    
    def _do_export(self):
        """Perform export"""
        if not self.dest_path.text():
            QMessageBox.warning(self, "Export", "Please select a destination.")
            return
        
        # Get selected columns
        selected_columns = []
        for i in range(self.column_list.count()):
            item = self.column_list.item(i)
            if item.checkState() == Qt.Checked:
                selected_columns.append(item.data(Qt.UserRole))
        
        if not selected_columns:
            QMessageBox.warning(self, "Export", "Please select at least one column.")
            return
        
        # Get results to export
        results_to_export = self.results
        if self.filtered_only_check.isChecked():
            # Get filtered results from table
            results_to_export = self._get_filtered_results()
        
        # Show progress
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(len(results_to_export))
        self.progress_bar.setValue(0)
        
        # Export based on format
        format_name = self.format_combo.currentText()
        file_path = self.dest_path.text()
        
        try:
            if format_name == "CSV":
                self._export_csv(results_to_export, selected_columns, file_path)
            elif format_name == "JSON":
                self._export_json(results_to_export, selected_columns, file_path)
            elif format_name == "Excel (.xlsx)":
                self._export_excel(results_to_export, selected_columns, file_path)
            elif format_name == "PDF":
                self._export_pdf(results_to_export, selected_columns, file_path)
            
            QMessageBox.information(self, "Export", f"Export completed successfully!\n{file_path}")
            self.export_complete.emit(file_path)
            self.accept()
            
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export:\n{str(e)}")
        finally:
            self.progress_bar.setVisible(False)
```

---

## 4. Format-Specific Implementations

### 4.1 CSV Export

**Location**: `SRC/gui/exporters.py` (NEW)

```python
# SRC/gui/exporters.py
import csv
from typing import List

class CSVExporter:
    """CSV export implementation"""
    
    @staticmethod
    def export(results: List[TrackResult], columns: List[str], file_path: str, progress_callback=None):
        """Export to CSV"""
        fieldnames = columns
        
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            
            for idx, result in enumerate(results):
                row = {col: result.to_dict().get(col, "") for col in columns}
                writer.writerow(row)
                
                if progress_callback:
                    progress_callback(idx + 1)
```

### 4.2 JSON Export

```python
# SRC/gui/exporters.py
import json
from typing import List

class JSONExporter:
    """JSON export implementation"""
    
    @staticmethod
    def export(results: List[TrackResult], columns: List[str], file_path: str, progress_callback=None):
        """Export to JSON"""
        data = []
        
        for idx, result in enumerate(results):
            result_dict = result.to_dict()
            row = {col: result_dict.get(col, "") for col in columns}
            data.append(row)
            
            if progress_callback:
                progress_callback(idx + 1)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
```

### 4.3 Excel Export

**Requires**: `openpyxl` package

```python
# SRC/gui/exporters.py
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

class ExcelExporter:
    """Excel export implementation"""
    
    @staticmethod
    def export(results: List[TrackResult], columns: List[str], file_path: str, progress_callback=None):
        """Export to Excel"""
        if not OPENPYXL_AVAILABLE:
            raise ImportError("openpyxl is required for Excel export. Install with: pip install openpyxl")
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Results"
        
        # Header row
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF")
        
        for col_idx, col_name in enumerate(columns, start=1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        
        # Data rows
        for row_idx, result in enumerate(results, start=2):
            result_dict = result.to_dict()
            for col_idx, col_name in enumerate(columns, start=1):
                value = result_dict.get(col_name, "")
                ws.cell(row=row_idx, column=col_idx, value=value)
            
            if progress_callback:
                progress_callback(row_idx - 1)
        
        # Auto-adjust column widths
        for col_idx, col_name in enumerate(columns, start=1):
            column_letter = ws.cell(row=1, column=col_idx).column_letter
            ws.column_dimensions[column_letter].width = 15
        
        wb.save(file_path)
```

### 4.4 PDF Export

**Requires**: `reportlab` package

```python
# SRC/gui/exporters.py
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

class PDFExporter:
    """PDF export implementation"""
    
    @staticmethod
    def export(results: List[TrackResult], columns: List[str], file_path: str, progress_callback=None):
        """Export to PDF"""
        if not REPORTLAB_AVAILABLE:
            raise ImportError("reportlab is required for PDF export. Install with: pip install reportlab")
        
        doc = SimpleDocTemplate(file_path, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title = Paragraph("CuePoint Export Results", styles['Title'])
        elements.append(title)
        elements.append(Spacer(1, 12))
        
        # Prepare data
        data = [columns]  # Header row
        
        for idx, result in enumerate(results):
            result_dict = result.to_dict()
            row = [str(result_dict.get(col, "")) for col in columns]
            data.append(row)
            
            if progress_callback:
                progress_callback(idx + 1)
        
        # Create table
        table = Table(data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))
        
        elements.append(table)
        doc.build(elements)
```

---

## 5. Integration with Results View

**Location**: `SRC/gui/results_view.py` (MODIFY)

```python
# SRC/gui/results_view.py
from .export_dialog import ExportDialog

class ResultsView(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        # ... existing code ...
        
        # Add export button to toolbar
        export_button = QPushButton("Export...")
        export_button.clicked.connect(self._show_export_dialog)
        # ... add to toolbar ...
    
    def _show_export_dialog(self):
        """Show export dialog"""
        # Get results to export (filtered or all)
        results_to_export = self._get_visible_results()
        
        dialog = ExportDialog(results_to_export, self)
        if dialog.exec_() == QDialog.Accepted:
            file_path = dialog.export_complete.emit()
            QMessageBox.information(self, "Export", f"Exported to:\n{file_path}")
    
    def _get_visible_results(self) -> List[TrackResult]:
        """Get currently visible results"""
        visible_results = []
        for row_idx in range(self.table.rowCount()):
            if not self.table.isRowHidden(row_idx):
                visible_results.append(self.results[row_idx])
        return visible_results
```

---

## 6. Format-Specific Options

### 6.1 CSV Options
- Delimiter selection (comma, semicolon, tab)
- Encoding (UTF-8, UTF-8-BOM, etc.)
- Include header row

### 6.2 Excel Options
- Sheet name customization
- Styling options (colors, fonts)
- Freeze header row
- Auto-filter

### 6.3 JSON Options
- Pretty print (indented) vs compact
- Include metadata

### 6.4 PDF Options
- Page size (Letter, A4)
- Orientation (Portrait, Landscape)
- Include summary statistics

---

## 7. Testing Strategy

### Unit Tests
- CSV export: Correct format
- JSON export: Valid JSON, correct structure
- Excel export: File opens, data correct
- PDF export: File opens, readable

### Integration Tests
- Export dialog: All options work
- Column selection: Selected columns exported
- Filter integration: Filtered results exported
- Progress indicator: Updates correctly

### Manual Testing
- Export each format
- Verify file contents
- Test with large datasets
- Test error handling

---

## 8. Acceptance Criteria

- [ ] Export dialog displays correctly
- [ ] All formats export successfully
- [ ] Column selection works
- [ ] Filter integration works
- [ ] Progress indicator shows
- [ ] Files saved correctly
- [ ] Error handling works
- [ ] Optional dependencies handled gracefully

---

## 9. Dependencies

- **Requires**: Phase 1 GUI Foundation (ResultsView)
- **Requires**: Phase 0 Backend (TrackResult objects)
- **Optional**: `openpyxl` for Excel export
- **Optional**: `reportlab` for PDF export

---

## 10. Future Enhancements

- **Template system**: Custom export templates
- **Batch export**: Export multiple formats at once
- **Email export**: Send results via email
- **Cloud export**: Export to Google Drive, Dropbox
- **Scheduled exports**: Auto-export on completion

---

*This design is essential for Phase 2 completion.*

