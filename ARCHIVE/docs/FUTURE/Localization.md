# Localization (Future - v1.1+)

## v1.0 Status
- ❌ Not implemented
- ✅ Strings remain hardcoded in English
- ✅ UI is English-only
- ✅ i18n hooks prepared (no-op)

## v1.1+ Implementation Plan

### Phase 1: String Externalization
1. Create `SRC/cuepoint/ui/strings.py` with all UI strings
2. Replace hardcoded strings with string constants
3. Use `I18nManager.tr()` for all user-facing strings

### Phase 2: Translation System
1. Set up Qt translation system (QTranslator)
2. Create translation template (.ts file)
3. Implement language selection UI
4. Load translations on app startup

### Phase 3: Translation Files
1. Create .ts files for target languages:
   - Spanish (es)
   - French (fr)
   - German (de)
   - Italian (it)
2. Compile .ts to .qm files
3. Bundle .qm files with app

### Phase 4: Testing
1. Test all languages
2. Verify string completeness
3. Test language switching
4. Test RTL languages (if needed)

## Technical Details

### Qt Translation System
- Use `QTranslator` for translations
- Use `QLocale` for locale detection
- Translation files: `.ts` (source) → `.qm` (compiled)

### String Marking
- Mark all translatable strings with `tr()`
- Provide context for ambiguous strings
- Use `%1`, `%2` for dynamic content

### Translation Workflow
1. Extract strings: `pylupdate6 -ts translations/cuepoint.ts`
2. Translate: Edit .ts file with Qt Linguist
3. Compile: `lrelease translations/cuepoint.ts`
4. Bundle: Include .qm files in app resources

## Rationale for Exclusion
- v1.0 targets English-speaking market primarily
- Localization adds significant complexity
- Can be added incrementally in v1.1+
- Hooks prepared for easy future implementation
