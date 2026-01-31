 # Step 10: Documentation and Developer Experience Design
 
 ## Purpose
 Make contributions and maintenance predictable and low-friction.
 
 ## Current State
 - Docs exist in `DOCS/` and `.github/`.
 - Some guides are scattered.
 
 ## Proposed Implementation
 
 ### 10.1 Documentation Portal
 - Single entry point (`DOCS/README.md`).
 - Clear navigation for user vs developer docs.
 
 ### 10.2 Developer Onboarding
 - Setup scripts for dependencies and test runs.
 - Local dev checklist (lint, type check, unit tests).
 
 ### 10.3 Maintenance Docs
 - Changelog policy and versioning guidelines.
 - Output schema versioning policy.
 
 ## Code Touchpoints
 - `DOCS/README.md`
 - `DOCS/DEVELOPMENT/`
 - `DOCS/GUIDES/`
 
 ## Example Contributor Checklist
 ```text
 - [ ] Run tests
 - [ ] Update docs
 - [ ] No new lint issues
 ```
 
 ## Testing Plan
 - Validate docs build or link checker (optional).
 - Verify onboarding steps work on clean machine.
 
 ## Acceptance Criteria
 - New contributor can run the app within 30 minutes.
 - Docs clearly describe release and support processes.
 
 ---
 
 ## 10.4 Documentation Principles
 
 - Single source of truth.
 - Clear navigation.
 - Short, task-focused pages.
 
 ## 10.5 Developer Onboarding Checklist
 
 - Install dependencies.
 - Run tests.
 - Run app.
 
 ## 10.6 Doc Testing
 
 - Link checker.
 - Broken links fail CI.
 
 ## 10.7 Documentation Architecture
 
 - User docs vs developer docs separated.
 - One landing page for navigation.
 - Consistent naming conventions.
 
 ## 10.8 Documentation Taxonomy
 
 - Getting Started
 - User Guide
 - Troubleshooting
 - Developer Guide
 - Release Docs
 
 ## 10.9 Documentation Navigation
 
 - `DOCS/README.md` as index.
 - Sidebar or table of contents.
 
 ## 10.10 Documentation Ownership
 
 - Assign doc owners per section.
 - Review docs quarterly.
 
 ## 10.11 Documentation Update Policy
 
 - Update docs with every major change.
 - Update release docs per release.
 
 ## 10.12 Documentation Style Guide
 
 - Short paragraphs.
 - Use headings.
 - Use code blocks for commands.
 
 ## 10.13 Documentation Templates
 
 - Guide template.
 - FAQ template.
 - Troubleshooting template.
 
 ## 10.14 Developer Onboarding Steps (Detailed)
 
 1. Clone repo.
 2. Create venv.
 3. Install deps.
 4. Run tests.
 5. Launch app.
 
 ## 10.15 Developer Onboarding Script
 
 - Provide `scripts/dev_setup.py`.
 - Validate environment.
 
 ## 10.16 Developer Onboarding Checklist (Expanded)
 
 - Python version OK.
 - Dependencies installed.
 - Tests pass.
 - App runs.
 
 ## 10.17 Developer Tooling
 
 - Ruff for linting.
 - Mypy for types.
 - Pytest for tests.
 
 ## 10.18 Dev Workflow
 
 - Create branch.
 - Implement change.
 - Run tests.
 - Open PR.
 
 ## 10.19 Dev Workflow Checklist
 
 - [ ] Lint
 - [ ] Types
 - [ ] Tests
 - [ ] Docs
 
 ## 10.20 Dev Environment Variables
 
 - `CUEPOINT_ENV=dev`
 - `CUEPOINT_DEBUG=1`
 
 ## 10.21 Dev Debugging Guide
 
 - Enable debug logs.
 - Capture sample XML.
 - Reproduce issue.
 
 ## 10.22 Dev Setup Troubleshooting
 
 - Missing dependencies.
 - PyInstaller version mismatch.
 
 ## 10.23 Dev Setup Troubleshooting Copy
 
 - "Install Python 3.13+."
 - "Run pip install -r requirements.txt."
 
 ## 10.24 Repository Structure Doc
 
 - Explain key folders.
 - Link to architecture diagram.
 
 ## 10.25 Architecture Overview Doc
 
 - Pipeline overview.
 - Core services.
 
 ## 10.26 Developer FAQ
 
 - "How to run tests?"
 - "How to add new match rules?"
 
 ## 10.27 Code Comments Guidelines
 
 - Comment complex logic only.
 - Avoid obvious comments.
 
 ## 10.28 Code Review Checklist
 
 - [ ] Tests added
 - [ ] Docs updated
 - [ ] No lint issues
 
 ## 10.29 Code Review Ownership
 
 - Assign reviewers by module.
 
 ## 10.30 Doc Build Pipeline
 
 - Add link checker in CI.
 - Fail on broken links.
 
 ## 10.31 Doc Build Output
 
 - HTML or Markdown only.
 
 ## 10.32 Doc Preview Workflow
 
 - Use GitHub Pages or local preview.
 
 ## 10.33 Doc Versioning
 
 - Tag docs with release version.
 
 ## 10.34 Changelog Policy
 
 - Each PR updates changelog.
 
 ## 10.35 Versioning Policy
 
 - Follow semver.
 
 ## 10.36 Output Schema Versioning Doc
 
 - Document schema updates.
 
 ## 10.37 Dev Test Data
 
 - Provide sample XML.
 - Provide sample outputs.
 
 ## 10.38 Dev Test Data Location
 
 - `DOCS/getting-started/`
 
 ## 10.39 Dev Setup Automation
 
 - Script to install deps.
 - Script to run tests.
 
 ## 10.40 Dev Setup Automation Example
 
 ```bash
 python scripts/dev_setup.py
 ```
 
 ## 10.41 Contribution Guidelines
 
 - Use PR template.
 - Add tests.
 - Update docs.
 
 ## 10.42 Contribution Template
 
 - Summary
 - Tests
 - Docs
 
 ## 10.43 Dev Environment Consistency
 
 - Use `pyproject.toml` for tool config.
 
 ## 10.44 Dev CI Parity
 
 - Run same checks locally.
 
 ## 10.45 Dev Hooks
 
 - Pre-commit hooks for lint.
 
 ## 10.46 Dev Hooks Policy
 
 - Hooks must pass before push.
 
 ## 10.47 Doc Linting
 
 - Spell check (optional).
 - Markdown lint.
 
 ## 10.48 Doc Linting Rules
 
 - No broken links.
 - No trailing whitespace.
 
 ## 10.49 Doc Ownership Matrix
 
 | Section | Owner |
 | --- | --- |
 | User Guide | Docs lead |
 | Dev Guide | Eng lead |
 
 ## 10.50 Doc Review Cadence
 
 - Quarterly review.
 - Update on major changes.
 
 ## 10.51 Doc Metrics
 
 - Page views (if hosted).
 - Time to find info.
 
 ## 10.52 Doc Metrics Targets
 
 - Reduce support tickets by 20%.
 
 ## 10.53 Doc Accessibility
 
 - Use accessible headings.
 - Provide alt text for images.
 
 ## 10.54 Doc Accessibility Tests
 
 - Run accessibility lint.
 
 ## 10.55 Developer Experience Principles
 
 - Fast feedback loops.
 - Clear setup steps.
 - Minimal friction.
 
 ## 10.56 DX Tooling
 
 - Formatter
 - Linter
 - Type checker
 
 ## 10.57 DX Feedback Loop
 
 - Run tests locally.
 - Run checks in CI.
 
 ## 10.58 DX Time Budget
 
 - Local test suite < 10 minutes.
 
 ## 10.59 DX Test Subsets
 
 - `pytest -m unit`
 - `pytest -m integration`
 
 ## 10.60 DX CI Matrix
 
 - Windows, macOS.
 - Python 3.12/3.13.
 
 ## 10.61 DX Troubleshooting
 
 - "Import error" -> check venv.
 - "Missing DLL" -> update PyInstaller.
 
 ## 10.62 DX Scripts
 
 - `scripts/dev_setup.py`
 - `scripts/run_tests.py`
 
 ## 10.63 DX Scripts Usage
 
 ```bash
 python scripts/run_tests.py --unit
 ```
 
 ## 10.64 DX Sample .env (Optional)
 
 - Provide `.env.example`.
 
 ## 10.65 DX Config Overrides
 
 - Local config overrides via YAML.
 
 ## 10.66 DX IDE Settings
 
 - Recommend VSCode/Cursor settings.
 
 ## 10.67 DX Editor Extensions
 
 - Python
 - Ruff
 
 ## 10.68 DX Debugging Tips
 
 - Use breakpoints in `processor_service`.
 - Use logging with `DEBUG`.
 
 ## 10.69 DX Logging Configuration
 
 - Set `CUEPOINT_DEBUG=1`.
 
 ## 10.70 DX Test Coverage Targets
 
 - Unit: 85%.
 - Integration: 70%.
 
 ## 10.71 DX Doc Testing in CI
 
 - Link checker.
 - Markdown lint.
 
 ## 10.72 DX PR Template
 
 - Summary
 - Tests
 - Docs
 
 ## 10.73 DX Issue Templates
 
 - Bug report.
 - Feature request.
 
 ## 10.74 DX Release Docs
 
 - Release checklist.
 - Rollback plan.
 
 ## 10.75 DX Contribution Policy
 
 - Require tests for new features.
 
 ## 10.76 DX Performance Baselines
 
 - Ensure no regression in benchmarks.
 
 ## 10.77 DX Dependencies
 
 - Pin versions.
 - Document upgrades.
 
 ## 10.78 DX Dependency Updates
 
 - Monthly updates.
 
 ## 10.79 DX Automation
 
 - Pre-commit hooks.
 - CI checks.
 
 ## 10.80 DX Automation Checklist
 
 - [ ] Lint
 - [ ] Type check
 - [ ] Tests
 - [ ] Docs
 
 ## 10.81 DX Onboarding Metrics
 
 - Time to first run.
 - Setup errors.
 
 ## 10.82 DX Onboarding Targets
 
 - < 30 minutes setup.
 
 ## 10.83 DX Backlog
 
 - Add one-click setup.
 
 ## 10.84 DX Ownership
 
 - Dev lead.
 - Docs lead.
 
 ## 10.85 DX Glossary
 
 - DX: Developer Experience.
 - Doc portal: entry point for docs.
 
 ## 10.86 DX Checklist (Condensed)
 
 - Setup works.
 - Tests pass.
 - Docs updated.
 
 ## 10.87 Docs: User vs Developer
 
 - User: usage and workflows.
 - Developer: setup and internals.
 
 ## 10.88 Docs: Release
 
 - Release checklist.
 - Rollback plan.
 
 ## 10.89 Docs: Troubleshooting
 
 - Common errors list.
 - Fix steps.
 
 ## 10.90 Docs: Security
 
 - Privacy notice.
 - Security response process.
 
 ## 10.91 Docs: Architecture
 
 - Pipeline diagram.
 - Key modules.
 
 ## 10.92 Docs: Style Guide
 
 - Sentence case headings.
 - Use consistent terms.
 
 ## 10.93 Docs: Term Consistency
 
 - Use "XML" not "xml".
 - Use "playlist" not "set".
 
 ## 10.94 Docs: Screenshot Policy
 
 - Update screenshots per UI change.
 
 ## 10.95 Docs: Screenshot Storage
 
 - `DOCS/images/`.
 
 ## 10.96 Docs: CLI Examples
 
 - Provide copy/paste examples.
 
 ## 10.97 Docs: GUI Examples
 
 - Provide screenshots.
 
 ## 10.98 Docs: Localization
 
 - Avoid embedded text in images.
 
 ## 10.99 Docs: Accessibility
 
 - Alt text for images.
 
 ## 10.100 Docs: Link Strategy
 
 - Prefer relative links.
 - Avoid hardcoded domains.
 
 ## 10.101 Docs: Link Checker Rules
 
 - No 404 links.
 - No http links for internal docs.
 
 ## 10.102 Docs: Versioning Strategy
 
 - Tag docs by release.
 - Archive old docs.
 
 ## 10.103 Docs: Archive Policy
 
 - Move outdated docs to `ARCHIVE/`.
 
 ## 10.104 Docs: PR Checklist
 
 - [ ] Docs updated for user-facing changes.
 - [ ] Screenshots updated if UI changed.
 
 ## 10.105 Docs: Release Notes
 
 - Use template in `DOCS/RELEASE/`.
 
 ## 10.106 Docs: Migration Guides
 
 - Provide guides for breaking changes.
 
 ## 10.107 Docs: Sample Data
 
 - Include sample XML.
 - Include sample outputs.
 
 ## 10.108 Docs: Sample Data Policy
 
 - Use synthetic data only.
 
 ## 10.109 DX: Repo Setup Commands
 
 - `python -m venv .venv`
 - `pip install -r requirements.txt`
 
 ## 10.110 DX: Quick Start Commands
 
 - `python main.py --help`
 
 ## 10.111 DX: Running GUI
 
 - `python SRC/gui_app.py`
 
 ## 10.112 DX: Running CLI
 
 - `python SRC/main.py --xml ...`
 
 ## 10.113 DX: Testing Commands
 
 - `pytest`
 - `pytest -m unit`
 
 ## 10.114 DX: Lint Commands
 
 - `ruff check .`
 
 ## 10.115 DX: Type Check Commands
 
 - `mypy SRC`
 
 ## 10.116 DX: Build Commands
 
 - `python scripts/build_pyinstaller.py`
 
 ## 10.117 DX: Debug Commands
 
 - `CUEPOINT_DEBUG=1 python SRC/main.py`
 
 ## 10.118 DX: Troubleshooting Checklist
 
 - Check Python version.
 - Check venv activated.
 - Check dependencies.
 
 ## 10.119 DX: Troubleshooting FAQ
 
 - "Why is PyInstaller failing?"
 - "Why are tests slow?"
 
 ## 10.120 DX: Project Conventions
 
 - Use snake_case for Python.
 - Keep functions small.
 
 ## 10.121 DX: Testing Strategy Doc
 
 - Document test pyramid.
 
 ## 10.122 DX: Testing Strategy Outline
 
 - Unit → Integration → System.
 
 ## 10.123 DX: Local Dev Data
 
 - Use `fixtures/`.
 
 ## 10.124 DX: CI Parity Checklist
 
 - Run same lint rules.
 - Run same type checks.
 
 ## 10.125 DX: Contribution Flow
 
 - Fork → branch → PR.
 
 ## 10.126 DX: PR Review Flow
 
 - Assign reviewer.
 - Run tests.
 - Merge.
 
 ## 10.127 DX: Issue Triage Flow
 
 - Label issue.
 - Assign owner.
 
 ## 10.128 DX: Docs Build (Optional)
 
 - Build with MkDocs (optional).
 
 ## 10.129 DX: Docs Build Commands
 
 - `mkdocs build`
 
 ## 10.130 DX: Docs Preview
 
 - `mkdocs serve`
 
 ## 10.131 DX: Tool Versions
 
 - Python 3.13+
 - PyInstaller 6.10+
 
 ## 10.132 DX: Version Sync
 
 - `scripts/sync_version.py`.
 
 ## 10.133 DX: Version Sync Tests
 
 - Validate version files.
 
 ## 10.134 DX: Doc Ownership Table
 
 | Doc Area | Owner |
 | --- | --- |
 | User Docs | Docs Lead |
 | Dev Docs | Eng Lead |
 
 ## 10.135 DX: Documentation Standards
 
 - Use consistent terminology.
 - Use clear steps.
 
 ## 10.136 DX: Documentation Examples
 
 - "Step 1: Export XML".
 - "Step 2: Choose playlist".
 
 ## 10.137 DX: Dev Tools Install
 
 - Provide script to install tools.
 
 ## 10.138 DX: Dev Tools Validation
 
 - Check versions match requirements.
 
 ## 10.139 DX: Sample .env.example
 
 - Document optional env vars.
 
 ## 10.140 DX: Environment Variables Doc
 
 - List all supported env vars.
 
 ## 10.141 DX: Environment Variables Table
 
 | Var | Description |
 | --- | --- |
 | CUEPOINT_DEBUG | Enable debug logs |
 
 ## 10.142 DX: Doc Linting Setup
 
 - Markdown lint in CI.
 
 ## 10.143 DX: Doc Linting Rules
 
 - Max line length (optional).
 
 ## 10.144 DX: Code Style Guide
 
 - Follow PEP8.
 
 ## 10.145 DX: Formatting Tools
 
 - Ruff format (if used).
 
 ## 10.146 DX: Formatting Policy
 
 - Auto-format on save (optional).
 
 ## 10.147 DX: Dev Container (Optional)
 
 - Provide devcontainer config.
 
 ## 10.148 DX: Dev Container Benefits
 
 - Consistent environment.
 
 ## 10.149 DX: Setup Time Targets
 
 - First run < 30 minutes.
 
 ## 10.150 DX: Docs Summary
 
 - Clear docs reduce support load.
 
 ## 10.151 DX: Sample CONTRIBUTING.md Outline
 
 - Setup steps.
 - Coding standards.
 - Test instructions.
 
 ## 10.152 DX: Sample CODE_OF_CONDUCT.md Outline
 
 - Expected behavior.
 - Reporting issues.
 
 ## 10.153 DX: Release Docs Index
 
 - Release checklist.
 - Release notes.
 - Rollback plan.
 
 ## 10.154 DX: Developer Guide Index
 
 - Architecture.
 - Services.
 - Data flow.
 
 ## 10.155 DX: Code Reading Guide
 
 - Start at `SRC/main.py`.
 - Follow `processor_service`.
 
 ## 10.156 DX: Doc Change Review
 
 - Require review for major doc changes.
 
 ## 10.157 DX: Docs Build in CI
 
 - Fail CI if docs build fails.
 
 ## 10.158 DX: Docs Coverage
 
 - Ensure all major features documented.
 
 ## 10.159 DX: Feature Doc Checklist
 
 - Purpose.
 - Usage.
 - Limitations.
 
 ## 10.160 DX: Troubleshooting Patterns
 
 - Error code → fix.
 
 ## 10.161 DX: Error Code Doc Table
 
 | Code | Meaning | Fix |
 | --- | --- | --- |
 | P003 | XML parse error | Re-export XML |
 
 ## 10.162 DX: Test Data README
 
 - Document fixture sources.
 
 ## 10.163 DX: Fixtures Policy
 
 - Use synthetic data.
 - No personal data.
 
 ## 10.164 DX: Test Docs
 
 - How to run tests.
 - How to update fixtures.
 
 ## 10.165 DX: Sample Test Doc
 
 - `DOCS/DEVELOPMENT/testing.md`
 
 ## 10.166 DX: Sample Build Doc
 
 - `DOCS/GUIDES/build.md`
 
 ## 10.167 DX: Docs Metadata
 
 - Add "Last updated" header.
 
 ## 10.168 DX: Docs Metadata Example
 
 - "Last updated: 2026-01-31"
 
 ## 10.169 DX: Changelog Format
 
 - Keep a consistent section per version.
 
 ## 10.170 DX: Changelog Example
 
 - `## 1.2.3 - 2026-01-31`
 
 ## 10.171 DX: Release Notes Sections
 
 - Highlights.
 - Fixes.
 - Known issues.
 
 ## 10.172 DX: Release Notes Example
 
 - "Fixed XML parsing edge case."
 
 ## 10.173 DX: Docs Localization Plan
 
 - Keep source language English.
 
 ## 10.174 DX: Docs Localization Constraints
 
 - Avoid idioms.
 
 ## 10.175 DX: Docs Testing Matrix
 
 | Test | Priority |
 | --- | --- |
 | Link check | P0 |
 | Spell check | P2 |
 
 ## 10.176 DX: Developer Skill Map
 
 - Core: Python, Qt.
 - Supporting: CI/CD.
 
 ## 10.177 DX: Onboarding FAQ
 
 - "Where do I start?"
 - "How do I run tests?"
 
 ## 10.178 DX: Onboarding Script Output
 
 - Print next steps.
 
 ## 10.179 DX: Sample Onboarding Output
 
 ```
 Setup complete. Run: python SRC/gui_app.py
 ```
 
 ## 10.180 DX: Docs Site (Optional)
 
 - Host on GitHub Pages.
 
 ## 10.181 DX: Docs Site Structure
 
 - Home
 - Guides
 - API (if any)
 
 ## 10.182 DX: Docs Site Theme
 
 - Simple, readable theme.
 
 ## 10.183 DX: Docs Site Search
 
 - Add search box (optional).
 
 ## 10.184 DX: Docs Analytics (Optional)
 
 - Track top pages.
 
 ## 10.185 DX: Docs Analytics Privacy
 
 - Use privacy-respecting analytics.
 
 ## 10.186 DX: Documentation Backlog
 
 - Add "How matching works" doc.
 - Add "Troubleshooting export" doc.
 
 ## 10.187 DX: Architecture Diagram
 
 - Add to `DOCS/`.
 
 ## 10.188 DX: Architecture Diagram Content
 
 - Input → query → search → match → output.
 
 ## 10.189 DX: Codebase Tour Doc
 
 - Describe key modules.
 
 ## 10.190 DX: Codebase Tour Outline
 
 - `core/`
 - `services/`
 - `ui/`
 
 ## 10.191 DX: Contribution Guide Updates
 
 - Add "Tests required" section.
 
 ## 10.192 DX: Contribution Guide Example
 
 - "All new features must include tests."
 
 ## 10.193 DX: PR Checklist Template
 
 - Summary
 - Tests
 - Docs
 
 ## 10.194 DX: PR Checklist Example
 
 ```
 - [ ] Tests added
 - [ ] Docs updated
 ```
 
 ## 10.195 DX: Issue Templates
 
 - Bug report.
 - Feature request.
 
 ## 10.196 DX: Bug Template Fields
 
 - Steps to reproduce.
 - Expected behavior.
 - Actual behavior.
 
 ## 10.197 DX: Feature Request Fields
 
 - Problem.
 - Proposed solution.
 
 ## 10.198 DX: Docs Build Failures
 
 - Fix broken links.
 - Fix missing images.
 
 ## 10.199 DX: Docs QA Checklist
 
 - Spelling check.
 - Link check.
 
 ## 10.200 DX: Docs Governance
 
 - Review before release.
 
 ## 10.201 DX: Docs Final Notes
 
 - Keep docs current.
 
 ## 10.202 DX: Docs Done Criteria
 
 - Docs build passes.
 - Onboarding doc updated.
 
 
 
