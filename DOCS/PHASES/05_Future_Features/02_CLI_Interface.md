# Step 4.5: Command-Line Interface (CLI) (OPTIONAL)

**Status**: 📝 Planned (Evaluate Need Based on User Requests)  
**Priority**: 🚀 Medium Priority (Only if users request CLI/automation features)  
**Estimated Duration**: 3-4 days  
**Dependencies**: Phase 0 (backend), Phase 3 (performance monitoring)

## Goal
Provide a command-line interface for automation, scripting, and headless operation, enabling users to process playlists without the GUI.

## Success Criteria
- [ ] CLI interface implemented
- [ ] All core features accessible via CLI
- [ ] Configuration via command-line arguments
- [ ] Output formats supported (CSV, JSON)
- [ ] Progress reporting for CLI
- [ ] Error handling robust
- [ ] All features tested
- [ ] Documentation updated

---

## Analysis and Design Considerations

### Current State Analysis
- **Existing**: GUI-only application
- **Limitations**: No automation capability, no scripting support
- **Opportunity**: Enable automation, batch processing via scripts, CI/CD integration
- **Risk**: Low risk, mostly wrapper around existing functionality

### Use Cases
1. **Automation**: Process playlists via scripts
2. **Batch Processing**: Process multiple playlists from command line
3. **CI/CD Integration**: Integrate into automated workflows
4. **Server Deployment**: Run without GUI on servers

### CLI Design
- **Entry Point**: `cuepoint-cli` or `python -m cuepoint.cli`
- **Commands**: `process`, `batch`, `export`, `stats`
- **Configuration**: Command-line arguments + config file support
- **Output**: Progress to stdout, results to files

---

## Implementation Steps

### Substep 4.8.1: Create CLI Module (1-2 days)
**File**: `SRC/cli.py` (NEW)

**What to implement:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Command-Line Interface for CuePoint

Provides CLI access to all core functionality for automation and scripting.
"""

import argparse
import sys
from pathlib import Path
from typing import Optional, List
from SRC.processor import process_playlist
from SRC.output_writer import write_csv_files, write_json_file
from SRC.config import load_config

def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="CuePoint - Beatport Track Matcher (CLI)",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Process command
    process_parser = subparsers.add_parser('process', help='Process a playlist')
    process_parser.add_argument('playlist', type=str, help='Path to playlist XML file')
    process_parser.add_argument('-o', '--output', type=str, help='Output directory')
    process_parser.add_argument('-f', '--format', choices=['csv', 'json'], default='csv')
    process_parser.add_argument('--config', type=str, help='Configuration file path')
    
    # Batch command
    batch_parser = subparsers.add_parser('batch', help='Process multiple playlists')
    batch_parser.add_argument('playlists', nargs='+', help='Playlist XML files')
    batch_parser.add_argument('-o', '--output', type=str, help='Output directory')
    
    args = parser.parse_args()
    
    if args.command == 'process':
        process_single(args)
    elif args.command == 'batch':
        process_batch(args)
    else:
        parser.print_help()

def process_single(args):
    """Process a single playlist"""
    # Implementation
    pass

def process_batch(args):
    """Process multiple playlists"""
    # Implementation
    pass
```

**Implementation Checklist**:
- [ ] Create CLI module
- [ ] Implement argument parsing
- [ ] Implement process command
- [ ] Implement batch command
- [ ] Add progress reporting
- [ ] Add error handling
- [ ] Test CLI commands

---

## GUI Integration Note

**Note**: CLI is a standalone interface and doesn't require GUI integration. However, the GUI can optionally:
- Show CLI command examples in help menu
- Provide "Copy CLI Command" button to generate command-line equivalent
- Display CLI usage in About/Help dialog

### Optional GUI Enhancement: CLI Command Generator

**In `SRC/gui/main_window.py` (OPTIONAL):**

```python
def show_cli_command(self):
    """Show CLI command equivalent for current settings"""
    settings = self.config_panel.get_settings()
    xml_path = self.xml_path
    
    # Generate CLI command
    cmd_parts = ["cuepoint-cli", "process", xml_path]
    if settings.get("output_dir"):
        cmd_parts.extend(["-o", settings["output_dir"]])
    if settings.get("export_format"):
        cmd_parts.extend(["-f", settings["export_format"]])
    
    cmd = " ".join(cmd_parts)
    
    # Show in dialog
    QMessageBox.information(
        self,
        "CLI Command",
        f"Equivalent CLI command:\n\n{cmd}\n\n"
        f"You can copy this command to use in scripts or automation."
    )
```

---

## Comprehensive Testing (2-3 days)

**Dependencies**: All CLI implementation substeps must be completed

#### Part A: Unit Tests (`SRC/test_cli.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Comprehensive unit tests for CLI interface.

Tests argument parsing, command execution, error handling, and output.
"""

import unittest
import tempfile
import os
import sys
from unittest.mock import Mock, patch, MagicMock
from io import StringIO
from SRC.cli import main, process_single, process_batch
import argparse

class TestCLI(unittest.TestCase):
    """Comprehensive tests for CLI functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.test_xml = os.path.join(self.temp_dir, "test.xml")
        # Create minimal test XML
        with open(self.test_xml, 'w') as f:
            f.write('<?xml version="1.0"?><playlist><track><title>Test</title></track></playlist>')
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_process_command_parsing(self):
        """Test process command argument parsing"""
        test_args = ['process', self.test_xml, '-o', self.temp_dir, '-f', 'json']
        
        with patch('sys.argv', ['cuepoint-cli'] + test_args):
            with patch('SRC.cli.process_single') as mock_process:
                try:
                    main()
                except SystemExit:
                    pass
                mock_process.assert_called_once()
    
    def test_batch_command_parsing(self):
        """Test batch command argument parsing"""
        test_args = ['batch', self.test_xml, '-o', self.temp_dir]
        
        with patch('sys.argv', ['cuepoint-cli'] + test_args):
            with patch('SRC.cli.process_batch') as mock_batch:
                try:
                    main()
                except SystemExit:
                    pass
                mock_batch.assert_called_once()
    
    def test_process_single_basic(self):
        """Test processing single playlist"""
        args = Mock()
        args.playlist = self.test_xml
        args.output = self.temp_dir
        args.format = 'csv'
        args.config = None
        
        with patch('SRC.processor.process_playlist') as mock_process:
            mock_process.return_value = []
            process_single(args)
            mock_process.assert_called_once()
    
    def test_process_single_with_output(self):
        """Test processing with output directory"""
        args = Mock()
        args.playlist = self.test_xml
        args.output = self.temp_dir
        args.format = 'json'
        args.config = None
        
        with patch('SRC.processor.process_playlist') as mock_process, \
             patch('SRC.output_writer.write_json_file') as mock_write:
            mock_process.return_value = []
            process_single(args)
            mock_write.assert_called_once()
    
    def test_process_single_error_handling(self):
        """Test error handling in process_single"""
        args = Mock()
        args.playlist = "/nonexistent/file.xml"
        args.output = self.temp_dir
        args.format = 'csv'
        args.config = None
        
        # Should handle file not found gracefully
        with self.assertRaises((FileNotFoundError, SystemExit)):
            process_single(args)
    
    def test_batch_processing(self):
        """Test batch processing multiple playlists"""
        args = Mock()
        args.playlists = [self.test_xml]
        args.output = self.temp_dir
        
        with patch('SRC.processor.process_playlist') as mock_process:
            mock_process.return_value = []
            process_batch(args)
            mock_process.assert_called()
    
    def test_cli_help_output(self):
        """Test CLI help output"""
        test_args = ['--help']
        
        with patch('sys.argv', ['cuepoint-cli'] + test_args):
            with self.assertRaises(SystemExit):
                with patch('sys.stdout', new=StringIO()) as mock_stdout:
                    main()
                    output = mock_stdout.getvalue()
                    self.assertIn("CuePoint", output)
                    self.assertIn("process", output)
                    self.assertIn("batch", output)
    
    def test_invalid_command(self):
        """Test handling of invalid command"""
        test_args = ['invalid_command']
        
        with patch('sys.argv', ['cuepoint-cli'] + test_args):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                try:
                    main()
                except SystemExit:
                    pass
                output = mock_stdout.getvalue()
                # Should show help or error message
                self.assertTrue(len(output) > 0)

if __name__ == '__main__':
    unittest.main()
```

#### Part B: Integration Tests (`SRC/test_cli_integration.py`)

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integration tests for CLI functionality.

Tests end-to-end CLI workflow with real processing.
"""

import unittest
import tempfile
import os
import subprocess
import sys
from pathlib import Path

class TestCLIIntegration(unittest.TestCase):
    """Integration tests for CLI workflow"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.temp_dir = tempfile.mkdtemp()
        self.test_xml = os.path.join(self.temp_dir, "test.xml")
        # Create test XML
        with open(self.test_xml, 'w') as f:
            f.write('<?xml version="1.0"?><playlist><track><title>Test</title></track></playlist>')
    
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_cli_process_command_integration(self):
        """Test CLI process command end-to-end"""
        # This would test actual CLI execution
        # Requires CLI to be installed/available
        pass
    
    def test_cli_output_files_created(self):
        """Test that CLI creates output files correctly"""
        # Test that output files are created in specified format
        pass
    
    def test_cli_progress_output(self):
        """Test that CLI shows progress output"""
        # Test that progress is shown to stdout
        pass

if __name__ == '__main__':
    unittest.main()
```

#### Part C: Manual Testing Checklist

**CLI Functionality Testing**:
- [ ] CLI executable is available (`cuepoint-cli` or `python -m cuepoint.cli`)
- [ ] Help command works (`--help`)
- [ ] Process command works with valid XML
- [ ] Process command handles invalid XML gracefully
- [ ] Process command creates output files
- [ ] Process command supports CSV output
- [ ] Process command supports JSON output
- [ ] Process command respects output directory option
- [ ] Batch command processes multiple playlists
- [ ] Batch command handles errors in individual playlists
- [ ] Progress reporting works correctly
- [ ] Error messages are clear and helpful
- [ ] Exit codes are correct (0 for success, non-zero for errors)

**Configuration Testing**:
- [ ] CLI respects command-line arguments
- [ ] CLI loads configuration file when specified
- [ ] CLI uses default settings when no config specified
- [ ] CLI handles invalid configuration gracefully

**Output Testing**:
- [ ] CSV output is created correctly
- [ ] JSON output is created correctly
- [ ] Output files contain expected data
- [ ] Output directory is created if it doesn't exist
- [ ] Output files are overwritten correctly (or error if exists)

**Error Handling Testing**:
- [ ] Invalid XML file → Clear error message
- [ ] Missing XML file → Clear error message
- [ ] Invalid output directory → Clear error message
- [ ] Network errors → Handled gracefully
- [ ] Processing errors → Clear error messages
- [ ] Exit codes are correct for different error types

**Performance Testing**:
- [ ] CLI processing time is acceptable
- [ ] Progress reporting doesn't slow down processing
- [ ] Memory usage is reasonable
- [ ] No memory leaks with repeated CLI calls

**Cross-Step Integration Testing**:
- [ ] CLI works with Phase 3 performance tracking
- [ ] CLI works with Step 4.1 (Enhanced Export) options
- [ ] CLI works with Step 4.2 (Advanced Filtering) - if applicable
- [ ] CLI works with Step 4.3 (Async I/O) - if enabled
- [ ] CLI works with Step 4.4 (Traxsource) - if enabled

**Acceptance Criteria Verification**:
- ✅ CLI interface works
- ✅ All core features accessible via CLI
- ✅ Configuration via command-line arguments works
- ✅ Output formats supported (CSV, JSON)
- ✅ Progress reporting for CLI works
- ✅ Error handling robust
- ✅ All tests passing
- ✅ Manual testing complete

---

## Documentation Requirements

### User Guide Updates
- [ ] Document CLI commands
- [ ] Provide usage examples
- [ ] Document configuration options

---

## Acceptance Criteria
- ✅ CLI interface works
- ✅ All core features accessible
- ✅ Error handling robust
- ✅ All tests passing

---

**IMPORTANT**: Only implement this step if users request CLI/automation features.

**Next Step**: After evaluation, proceed to other Phase 4 steps or Phase 5.

