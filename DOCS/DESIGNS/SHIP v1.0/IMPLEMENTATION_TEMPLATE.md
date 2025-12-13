# Implementation Document Template

## Structure for All Implementation Steps

This template should be used for all SHIP v1.0 design documents to make them implementation-focused and analytical.

## Document Structure

```markdown
# Implementation Step X.Y: [Step Name]

## Implementation Overview
**What We're Building**: [Clear one-sentence description of what needs to be built]

## Implementation Tasks

### Task X.Y.1: [Task Name]

**What to Create**
- [List of specific deliverables]
- [Files to create]
- [Code to write]

**Implementation Details**

**X.Y.1.1 [Sub-task Name]**
- **File to Create/Modify**: `path/to/file.py`
- **Implementation**:
  ```python
  # Code example or pseudocode
  class Example:
      def method(self):
          # Implementation details
  ```
- **Integration**: How this integrates with existing code
- **Dependencies**: What this depends on

**X.Y.1.2 [Sub-task Name]**
- [Similar structure]

### Task X.Y.2: [Next Task]
[Similar structure]

## Implementation Checklist

### Documentation Tasks
- [ ] Task 1
- [ ] Task 2

### Code Analysis Tasks
- [ ] Review existing code
- [ ] Identify gaps

### Implementation Tasks (Code)
- [ ] Create file X
- [ ] Modify file Y
- [ ] Add feature Z

## Files to Create/Modify

### New Files
1. `path/to/new_file.py` - Description
2. `path/to/another_file.py` - Description

### Files to Modify
1. `path/to/existing_file.py` - What to change
2. `path/to/another_existing.py` - What to change

## Implementation Dependencies

### Prerequisites
- Step X: Dependency description

### Enables
- Step Y: What this enables

## Success Criteria

### Functional
- ✅ Criterion 1
- ✅ Criterion 2

### Technical
- ✅ Code quality metric
- ✅ Performance metric

## Next Implementation Steps

After completing Step X.Y:
1. **Step X.Y+1**: Next step
2. **Step Z**: Related step

## References

- Main document: `../XX_Step_Name.md`
- Related: Step X (Related Step)
```

## Key Principles

### 1. Implementation-Focused
- Every section should answer "What do we build?"
- Include specific file paths and code examples
- List exact tasks to complete

### 2. Analytical
- Break down into specific sub-tasks
- Explain why each component is needed
- Show dependencies and relationships

### 3. Actionable
- Clear checklists
- Specific file locations
- Code examples or pseudocode
- Integration points

### 4. Traceable
- Link to existing code
- Reference related steps
- Show dependencies

## Example Transformation

### Before (Design-Focused)
```markdown
### 1.4.1 Installation Outcome
**Target Statement**: End-user install without developer tooling
**What This Means**: Users can install using standard OS methods
```

### After (Implementation-Focused)
```markdown
### Task 1.4.1: Implement End-User Installation

**What to Build**
- PyInstaller configuration
- DMG creation script (macOS)
- NSIS installer script (Windows)
- Installation testing

**Implementation Details**

**1.4.1.1 PyInstaller Configuration**
- **File to Create**: `build/pyinstaller.spec`
- **Implementation**: [spec file contents]
- **Purpose**: Bundle Python and dependencies
```

## Checklist for Each Document

- [ ] Clear "What We're Building" statement
- [ ] Specific implementation tasks
- [ ] File paths and code locations
- [ ] Code examples or pseudocode
- [ ] Integration points
- [ ] Dependencies listed
- [ ] Success criteria defined
- [ ] Next steps identified

