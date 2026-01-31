 # Step 8: UX and Accessibility Design
 
 ## Purpose
 Make the GUI consistent, accessible, and easy to navigate for all users.
 
 ## Current State
 - UI exists with multiple dialogs and tabs.
 - Accessibility and localization are not formalized.
 
 ## Proposed Implementation
 
 ### 8.1 Visual Consistency
 - Define UI tokens (colors, spacing, typography).
 - Standardize hover/focus/disabled states.
 
 ### 8.2 Accessibility
 - Keyboard navigation and shortcuts.
 - Contrast checks for key UI elements.
 - Accessible labels for widgets.
 
 ### 8.3 Onboarding and Empty States
 - First-run flow for guidance.
 - Clear empty state messages and recovery tips.
 
 ## Code Touchpoints
 - `SRC/cuepoint/ui/` (main window, dialogs, widgets)
 - `SRC/cuepoint/ui/styles/` (theme tokens if introduced)
 
 ## Example UI Token Map
 ```python
 TOKENS = {
     "color_primary": "#2EA44F",
     "spacing_sm": 6,
     "radius_md": 8,
 }
 ```
 
 ## Testing Plan
 - Manual keyboard navigation tests.
 - Contrast checks with standard tools.
 - UI smoke tests for scaling and layout.
 
 ## Acceptance Criteria
 - UI states are consistent and accessible.
 - Keyboard-only navigation works for core flows.
 
 ---
 
 ## 8.4 UX Principles
 
 - Clear empty states.
 - Minimal friction.
 - Discoverable actions.
 
 ## 8.5 Accessibility Requirements
 
 - Tab order.
 - Focus states.
 - Contrast checks.
 
 ## 8.6 Localization Readiness
 
 - Centralize strings.
 - Avoid concatenation.
 
 ## 8.7 UX Architecture
 
 - Consistent layout grid.
 - Standard spacing tokens.
 - Unified dialog sizing.
 
 ## 8.8 UI Token System
 
 - Colors: primary, secondary, accent.
 - Spacing: 4, 8, 12, 16.
 - Typography: body, heading, caption.
 
 ## 8.9 UI Token Example
 
 ```python
 TOKENS = {
   "color_bg": "#0E1117",
   "color_text": "#E6EDF3",
   "spacing_md": 12
 }
 ```
 
 ## 8.10 Visual Consistency Checklist
 
 - Consistent button sizes.
 - Consistent icon sizes.
 - Consistent padding.
 
 ## 8.11 Interaction States
 
 - Default
 - Hover
 - Focus
 - Disabled
 
 ## 8.12 Focus Visibility
 
 - Focus ring always visible.
 - No hidden focus states.
 
 ## 8.13 Keyboard Navigation
 
 - Tab order matches visual flow.
 - Enter triggers primary action.
 - Esc closes dialogs.
 
 ## 8.14 Keyboard Shortcuts
 
 - Ctrl/Cmd+O: open XML.
 - Ctrl/Cmd+E: export.
 - Ctrl/Cmd+F: search.
 
 ## 8.15 Shortcut Discoverability
 
 - Show shortcuts in menus.
 - Document in Help > Shortcuts.
 
 ## 8.16 Accessibility Labels
 
 - Every input has label.
 - Every button has accessible name.
 
 ## 8.17 Contrast Requirements
 
 - WCAG AA minimum contrast.
 - Validate primary text.
 
 ## 8.18 Contrast Tests
 
 - Automated color checks.
 - Manual verification.
 
 ## 8.19 Empty State Design
 
 - No XML selected.
 - No playlist selected.
 - No results.
 
 ## 8.20 Empty State Copy
 
 - "Select a Rekordbox XML to start."
 - "Choose a playlist to continue."
 
 ## 8.21 Error Messaging UX
 
 - Show actionable errors.
 - Avoid technical jargon.
 
 ## 8.22 Error Message Patterns
 
 - Problem + fix suggestion.
 - Provide help link.
 
 ## 8.23 Progress Indicators
 
 - Progress bar with percentage.
 - Stage label (Parsing, Searching).
 
 ## 8.24 Cancellation UX
 
 - Cancel button visible during run.
 - Confirmation prompt if needed.
 
 ## 8.25 Resume UX
 
 - Resume prompt after crash.
 - Explain what will resume.
 
 ## 8.26 Output UX
 
 - "Open output folder" button.
 - "Open review file" button.
 
 ## 8.27 Review Workflow UX
 
 - Highlight low-confidence rows.
 - Provide filter for review items.
 
 ## 8.28 Results Table UX
 
 - Sticky header.
 - Sortable columns.
 - Filter input.
 
 ## 8.29 Results Table Performance
 
 - Virtualized rendering.
 - Batch updates.
 
 ## 8.30 Dialog Sizing
 
 - Standard widths.
 - Responsive to screen size.
 
 ## 8.31 Dialog Actions
 
 - Primary action right.
 - Secondary action left.
 
 ## 8.32 Onboarding UX
 
 - Step-by-step guidance.
 - Skip option.
 
 ## 8.33 Onboarding Content
 
 - What you need.
 - What you get.
 - Next steps.
 
 ## 8.34 Help UX
 
 - Help menu with docs links.
 - "Report issue" link.
 
 ## 8.35 Accessibility QA Checklist
 
 - Tab order correct.
 - Focus visible.
 - Contrast passes.
 
 ## 8.36 Accessibility Screen Reader Support
 
 - Provide accessible names for all controls.
 - Provide role and state for toggles.
 
 ## 8.37 Accessibility Testing Tools
 
 - Accessibility Inspector (macOS).
 - Windows Accessibility Insights.
 
 ## 8.38 Localization Strategy
 
 - Use Qt translations.
 - Store strings in resource files.
 
 ## 8.39 Localization Testing
 
 - Test with long strings.
 - Test with RTL languages (optional).
 
 ## 8.40 Layout Resilience
 
 - Ensure dialogs resize gracefully.
 - Avoid clipped text.
 
 ## 8.41 Typography Scale
 
 - Heading: 16-18px.
 - Body: 13-14px.
 - Caption: 11-12px.
 
 ## 8.42 Iconography
 
 - Consistent icon set.
 - Same stroke widths.
 
 ## 8.43 Theme Modes
 
 - Default dark theme.
 - Optional light theme.
 
 ## 8.44 Theme Token List (Extended)
 
 - `color_bg`
 - `color_surface`
 - `color_border`
 - `color_primary`
 - `color_error`
 
 ## 8.45 Spacing Token List
 
 - `spacing_xs`: 4
 - `spacing_sm`: 8
 - `spacing_md`: 12
 - `spacing_lg`: 16
 
 ## 8.46 UI Component Library
 
 - Buttons
 - Inputs
 - Dropdowns
 - Tables
 
 ## 8.47 UI Component Guidelines
 
 - Use same padding for all buttons.
 - Use same border radius for inputs.
 
 ## 8.48 Interaction Feedback
 
 - Show loading spinner during long actions.
 - Disable buttons during processing.
 
 ## 8.49 Error State Design
 
 - Red outline for invalid fields.
 - Error text below field.
 
 ## 8.50 Success State Design
 
 - Green check icon for completed steps.
 
 ## 8.51 Form Validation UX
 
 - Validate on submit.
 - Provide inline feedback.
 
 ## 8.52 Search UX
 
 - Focus search with shortcut.
 - Clear search button.
 
 ## 8.53 Filter UX
 
 - Filter by confidence.
 - Filter by status.
 
 ## 8.54 Sorting UX
 
 - Sort by score.
 - Sort by title.
 
 ## 8.55 Status Messaging
 
 - Idle: "Ready".
 - Running: "Processing...".
 - Completed: "Done".
 
 ## 8.56 Status Iconography
 
 - Spinner for running.
 - Check for success.
 - Exclamation for warning.
 
 ## 8.57 Results Highlighting
 
 - Low confidence rows in yellow.
 - Errors in red.
 
 ## 8.58 Export UX
 
 - Show export location.
 - Confirm export success.
 
 ## 8.59 Export Error UX
 
 - If export fails, show actionable message.
 
 ## 8.60 Accessibility Focus Order
 
 - XML path → Playlist → Start → Results.
 
 ## 8.61 Accessibility Keyboard Shortcuts (Extended)
 
 - Ctrl/Cmd+R: run.
 - Ctrl/Cmd+L: open logs.
 
 ## 8.62 Screen Reader Text
 
 - Provide accessible names for dynamic text.
 
 ## 8.63 Accessibility Contrast Targets
 
 - Text contrast >= 4.5:1.
 - UI control contrast >= 3:1.
 
 ## 8.64 Accessibility Targets
 
 - All primary actions keyboard accessible.
 - No mouse-only actions.
 
 ## 8.65 UX Copy Guidelines
 
 - Short, direct sentences.
 - Use "you" language.
 
 ## 8.66 UX Copy Examples
 
 - "Choose your XML file."
 - "Pick a playlist."
 
 ## 8.67 UX Copy for Errors
 
 - "We couldn't read the XML. Please re-export."
 
 ## 8.68 UX Copy for Warnings
 
 - "Large library detected. Processing may take longer."
 
 ## 8.69 Help Content Structure
 
 - Getting started.
 - Troubleshooting.
 - FAQ.
 
 ## 8.70 UX Metrics
 
 - First-run success rate.
 - Time to first successful run.
 - Support requests per release.
 
 ## 8.71 UX Success Criteria
 
 - 95% of users complete first run.
 - 90% of users find export files.
 
 ## 8.72 UX Research Plan (Optional)
 
 - Gather feedback from beta users.
 - Observe first-run friction points.
 
 ## 8.73 UX Feedback Channels
 
 - In-app feedback.
 - GitHub issues.
 
 ## 8.74 UX Onboarding Checklist
 
 - Explain XML export.
 - Explain review workflow.
 - Explain outputs.
 
 ## 8.75 UX Onboarding Copy (Extended)
 
 - "CuePoint reads your Rekordbox XML."
 - "It matches tracks with Beatport."
 - "You review low-confidence matches."
 
 ## 8.76 UX Empty State (XML)
 
 - Title: "No XML selected"
 - Action: "Browse"
 
 ## 8.77 UX Empty State (Playlist)
 
 - Title: "Choose a playlist"
 - Action: "Select playlist"
 
 ## 8.78 UX Empty State (Results)
 
 - Title: "No results yet"
 - Action: "Start processing"
 
 ## 8.79 UX Loading States
 
 - Parsing XML.
 - Searching candidates.
 - Writing outputs.
 
 ## 8.80 UX Loading Copy
 
 - "Parsing XML..."
 - "Searching Beatport..."
 - "Writing outputs..."
 
 ## 8.81 UX Error States (Expanded)
 
 - XML unreadable.
 - Playlist missing.
 - Output unwritable.
 
 ## 8.82 UX Error Recovery Actions
 
 - Retry.
 - Choose another file.
 
 ## 8.83 UX Notification Style
 
 - Toast for minor alerts.
 - Dialog for blocking errors.
 
 ## 8.84 UX Notification Timing
 
 - Toast visible 5s.
 
 ## 8.85 UX Settings Organization
 
 - Group by category (General, Performance, Privacy).
 
 ## 8.86 UX Settings Labels
 
 - Use plain language.
 - Avoid acronyms.
 
 ## 8.87 UX Settings Defaults
 
 - Safe defaults for new users.
 
 ## 8.88 UX Settings Tooltips
 
 - Provide help icon.
 
 ## 8.89 UX Layout Grid
 
 - 12-column grid.
 - Standard margins.
 
 ## 8.90 UX Spacing Rules
 
 - 8px baseline grid.
 
 ## 8.91 UX Visual Hierarchy
 
 - Primary actions emphasized.
 - Secondary actions subtle.
 
 ## 8.92 UX Button Hierarchy
 
 - Primary (solid).
 - Secondary (outline).
 - Tertiary (text).
 
 ## 8.93 UX Button States
 
 - Default.
 - Hover.
 - Disabled.
 
 ## 8.94 UX Input States
 
 - Empty.
 - Filled.
 - Error.
 
 ## 8.95 UX Table States
 
 - Empty.
 - Loading.
 - Populated.
 
 ## 8.96 UX Table Behavior
 
 - Sortable columns.
 - Resizable columns.
 
 ## 8.97 UX Table Accessibility
 
 - Announce row/column headers.
 
 ## 8.98 UX Color Palette
 
 - Primary: #2EA44F
 - Error: #E5534B
 - Warning: #D29922
 
 ## 8.99 UX Accessibility Checklist (Expanded)
 
 - Contrast >= 4.5:1.
 - All actions keyboard accessible.
 - All dialogs focus trapped.
 
 ## 8.100 UX Accessibility Tests
 
 - Tab through main flow.
 - Screen reader labels present.
 
 ## 8.101 UX Input Validation UX
 
 - Validate on submit.
 - Show inline error.
 
 ## 8.102 UX Inline Error Copy
 
 - "This field is required."
 - "Please choose a valid XML file."
 
 ## 8.103 UX Focus Management
 
 - Focus first field on dialog open.
 - Return focus after dialog close.
 
 ## 8.104 UX Modal Behavior
 
 - Prevent background interaction.
 - Esc closes if safe.
 
 ## 8.105 UX Progress Details
 
 - Show current stage.
 - Show processed count.
 
 ## 8.106 UX Progress Details Copy
 
 - "Processing 120/500"
 
 ## 8.107 UX Confirmation Dialogs
 
 - Confirm cancel.
 - Confirm overwrite outputs.
 
 ## 8.108 UX Confirmation Copy
 
 - "Cancel run? Progress will be saved."
 
 ## 8.109 UX Clipboard Actions
 
 - Copy run summary.
 - Copy run ID.
 
 ## 8.110 UX Clipboard Feedback
 
 - Toast: "Copied to clipboard."
 
 ## 8.111 UX Help Links
 
 - Link to workflows doc.
 - Link to troubleshooting.
 
 ## 8.112 UX Help Link Labels
 
 - "View workflow guide"
 - "Open troubleshooting"
 
 ## 8.113 UX Error Code Presentation
 
 - Show error code in footer.
 - Provide "Learn more" link.
 
 ## 8.114 UX Error Code Example
 
 - "Error P003 — XML parse failed."
 
 ## 8.115 UX Review Workflow
 
 - Show only low-confidence results.
 - Provide export for review file.
 
 ## 8.116 UX Review Copy
 
 - "Review low-confidence matches below."
 
 ## 8.117 UX Search Field
 
 - Placeholder: "Search results..."
 
 ## 8.118 UX Filters
 
 - Confidence slider.
 - Status dropdown.
 
 ## 8.119 UX Filter Defaults
 
 - Confidence: all.
 - Status: all.
 
 ## 8.120 UX Toolbar
 
 - Start
 - Pause
 - Export
 
 ## 8.121 UX Toolbar Icon Labels
 
 - "Start processing"
 - "Pause"
 - "Export results"
 
 ## 8.122 UX Table Column Names
 
 - Title
 - Artist
 - BPM
 - Key
 - Label
 
 ## 8.123 UX Table Column Order
 
 - Title
 - Artist
 - BPM
 - Key
 - Label
 
 ## 8.124 UX Table Column Widths
 
 - Title: 200px
 - Artist: 150px
 - BPM: 80px
 
 ## 8.125 UX Window Sizes
 
 - Min: 900x600
 - Default: 1100x700
 
 ## 8.126 UX Window Resizing
 
 - Remember last size.
 
 ## 8.127 UX Window Persistence
 
 - Save window size and position.
 
 ## 8.128 UX Tooltip Copy
 
 - "Select your Rekordbox XML file."
 
 ## 8.129 UX High-DPI Support
 
 - Scale icons.
 - Scale fonts.
 
 ## 8.130 UX Localization Edge Cases
 
 - Long strings.
 - Right-to-left text.
 
 ## 8.131 UX Localization Rules
 
 - Avoid truncation.
 - Use auto-layout.
 
 ## 8.132 UX Accessibility Targets
 
 - All dialogs navigable via keyboard.
 - Focus visible at all times.
 
 ## 8.133 UX Accessibility Tests (Expanded)
 
 - Screen reader reads labels.
 - Focus order matches flow.
 
 ## 8.134 UX A11y Text Alternatives
 
 - Alt text for images.
 - Accessible names for buttons.
 
 ## 8.135 UX Color Blindness Considerations
 
 - Do not rely on color alone.
 
 ## 8.136 UX Icon + Text Strategy
 
 - Icons accompanied by labels.
 
 ## 8.137 UX Error Summary Panel
 
 - Provide summary of errors.
 - Include error codes.
 
 ## 8.138 UX Error Summary Example
 
 - "2 errors, 1 warning"
 
 ## 8.139 UX Review Mode Toggle
 
 - Toggle between all and review-only.
 
 ## 8.140 UX Analytics (Optional)
 
 - Track completion of onboarding (opt-in).
 
 ## 8.141 UX Performance Considerations
 
 - Avoid heavy animations.
 - Limit UI redraw frequency.
 
 ## 8.142 UX Performance Tests
 
 - Scroll table with 10k rows.
 - Update progress at 5 Hz.
 
 ## 8.143 UX Accessibility Documentation
 
 - Document shortcuts.
 - Document accessibility support.
 
 ## 8.144 UX Accessibility Known Gaps
 
 - List any widgets without screen reader labels.
 
 ## 8.145 UX Settings Search
 
 - Add search box in settings (optional).
 
 ## 8.146 UX Settings Categories (Expanded)
 
 - General
 - Performance
 - Privacy
 - Updates
 
 ## 8.147 UX Settings Defaults (Expanded)
 
 - Safe defaults for new users.
 - Advanced toggles hidden by default.
 
 ## 8.148 UX Visual Regression Testing
 
 - Capture screenshots of dialogs.
 - Compare against baseline.
 
 ## 8.149 UX Visual Regression Policy
 
 - Update baseline only when intentional.
 
 ## 8.150 UX Testing Matrix
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Keyboard nav | Manual | P0 |
 | Contrast | Manual | P1 |
 | Layout resize | Manual | P1 |
 
 ## 8.151 UX Error Prevention
 
 - Disable Start until valid XML.
 - Show inline validation.
 
 ## 8.152 UX Error Recovery
 
 - Provide retry actions.
 - Provide help links.
 
 ## 8.153 UX Action Prioritization
 
 - Primary action highlighted.
 - Secondary action subtle.
 
 ## 8.154 UX Event Logging (Optional)
 
 - Log UI actions locally.
 
 ## 8.155 UX Event Logging Privacy
 
 - Never log file paths.
 
 ## 8.156 UX Style Guide
 
 - Document token usage.
 - Document components.
 
 ## 8.157 UX Component Inventory
 
 - Buttons
 - Inputs
 - Dropdowns
 - Tables
 
 ## 8.158 UX Component Specs
 
 - Button height: 32px.
 - Input height: 32px.
 
 ## 8.159 UX Component States
 
 - Default
 - Hover
 - Focus
 - Disabled
 
 ## 8.160 UX Feedback Mechanisms
 
 - Toast notifications.
 - Dialog confirmations.
 
 ## 8.161 UX Feedback Timing
 
 - Toasts visible 5 seconds.
 
 ## 8.162 UX Icon Alignment
 
 - Icons centered.
 - Consistent padding.
 
 ## 8.163 UX Keyboard Shortcut Conflicts
 
 - Ensure no conflicts with OS shortcuts.
 
 ## 8.164 UX Shortcut Documentation
 
 - List in Help menu.
 
 ## 8.165 UX Navigation Hierarchy
 
 - Main tabs on top.
 - Secondary actions in toolbar.
 
 ## 8.166 UX Layout Consistency
 
 - Same margins across tabs.
 
 ## 8.167 UX Empty State Illustration (Optional)
 
 - Use subtle illustration.
 
 ## 8.168 UX Error Dialog Design
 
 - Show error message + fix.
 - Include "Copy details".
 
 ## 8.169 UX Error Dialog Copy
 
 - "We couldn't process the XML. Please re-export."
 
 ## 8.170 UX Retry UX
 
 - Provide "Retry" button on network errors.
 
 ## 8.171 UX Pause UX
 
 - Provide "Pause" button during run.
 
 ## 8.172 UX Resume UX
 
 - Provide "Resume" button after pause.
 
 ## 8.173 UX Progress Labeling
 
 - Show stage name.
 - Show counts.
 
 ## 8.174 UX Status Bar
 
 - Show current status.
 - Show ETA.
 
 ## 8.175 UX Status Bar Copy
 
 - "Status: Processing"
 - "ETA: 12m"
 
 ## 8.176 UX Copy Guidelines (Expanded)
 
 - Avoid jargon.
 - Avoid long sentences.
 
 ## 8.177 UX Tone
 
 - Friendly.
 - Direct.
 
 ## 8.178 UX Copy Examples (Expanded)
 
 - "Let's get started."
 - "You're ready to export."
 
 ## 8.179 UX Accessibility Edge Cases
 
 - Focus loss after dialog close.
 - Missing labels in custom widgets.
 
 ## 8.180 UX Accessibility Fixes
 
 - Add buddy labels.
 - Add accessible names.
 
 ## 8.181 UX Accessibility Tests (Additional)
 
 - Screen reader reads button labels.
 - Focus stays within modal.
 
 ## 8.182 UX Visual QA Checklist
 
 - Check alignment.
 - Check spacing.
 - Check fonts.
 
 ## 8.183 UX Responsiveness Tests
 
 - Resize window to minimum.
 - Resize to maximum.
 
 ## 8.184 UX Error Dialog Actions
 
 - Copy error details.
 - Open logs folder.
 
 ## 8.185 UX Error Dialog Buttons
 
 - "Copy details"
 - "Open logs"
 
 ## 8.186 UX Help Menu Items
 
 - About
 - Help
 - Privacy
 
 ## 8.187 UX Help Menu Labels
 
 - "About CuePoint"
 - "Open Documentation"
 
 ## 8.188 UX About Dialog
 
 - Version number.
 - Links to docs.
 
 ## 8.189 UX About Dialog Copy
 
 - "CuePoint v1.2.3"
 
 ## 8.190 UX Credits
 
 - License references.
 - Third-party notices.
 
 ## 8.191 UX List of Dialogs
 
 - Onboarding
 - Settings
 - About
 - Export
 
 ## 8.192 UX Dialog Focus
 
 - Focus first field on open.
 
 ## 8.193 UX Navigation
 
 - Tabs remain visible.
 - Current tab highlighted.
 
 ## 8.194 UX Tab Labels
 
 - Main
 - Results
 - Export
 
 ## 8.195 UX Tab Icons
 
 - Optional, consistent size.
 
 ## 8.196 UX Tab Order
 
 - Main -> Results -> Export.
 
 ## 8.197 UX Input Placeholder Guidelines
 
 - Short, direct.
 
 ## 8.198 UX Search Placeholder
 
 - "Search tracks..."
 
 ## 8.199 UX Copy for Buttons
 
 - "Start"
 - "Pause"
 - "Export"
 
 ## 8.200 UX Final Notes
 
 - UX consistency reduces support load.
 
 ## 8.201 UX Appendix: Config Keys
 
 - `ui.theme`
 - `ui.font_size`
 - `ui.remember_window_size`
 
 ## 8.202 UX Appendix: CLI Flags
 
 - `--theme`
 - `--font-size`
 
 ## 8.203 UX Appendix: Token Reference
 
 - `color_primary`
 - `spacing_md`
 - `radius_md`
 
 ## 8.204 UX Appendix: Shortcut Reference
 
 - Ctrl/Cmd+O
 - Ctrl/Cmd+E
 - Ctrl/Cmd+F
 
 ## 8.205 UX Appendix: QA Checklist (Condensed)
 
 - Keyboard nav works.
 - Contrast passes.
 - Dialogs focus correctly.
 
 
 
 
