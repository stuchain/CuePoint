# Telemetry Policy

## v1.0 Status
- ❌ No telemetry implemented
- ✅ No data collection
- ✅ All processing local
- ✅ No network requests except for:
  - Beatport scraping (user-initiated)
  - Update checking (user-configurable)

## Privacy-First Approach

### Core Principles
1. **No Telemetry by Default**: Zero data collection in v1.0
2. **User Control**: If telemetry is added, it must be opt-in only
3. **Transparency**: Clear disclosure of what is collected
4. **Minimal Data**: Collect only what's necessary
5. **Local Processing**: All processing remains local

## Future Policy (if implemented in v1.1+)

### What Would Be Collected (if opt-in)
- **Usage Statistics** (anonymized):
  - App version
  - OS version
  - Feature usage (which features used)
  - Error rates (anonymized)

- **Performance Metrics** (anonymized):
  - Processing times
  - Memory usage
  - Crash reports (with user consent)

### What Would NOT Be Collected
- ❌ Personal information
- ❌ File contents
- ❌ Playlist names
- ❌ Track information
- ❌ User location
- ❌ IP addresses (if possible)

### Implementation Requirements (if added)
1. **Opt-in Only**: Default to OFF
2. **Clear Disclosure**: Explain what's collected
3. **Easy Disable**: One-click to disable
4. **Data Minimization**: Collect minimum necessary
5. **Secure Transmission**: Encrypted transmission
6. **Data Retention**: Limited retention period
7. **User Access**: Users can request their data
8. **User Deletion**: Users can request deletion

## Rationale for Exclusion
- Privacy-first approach for v1.0
- No clear need for telemetry initially
- Reduces complexity and privacy concerns
- Can be added later if needed (opt-in only)
