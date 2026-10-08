# Workflows

Common workflows for using CuePoint effectively.

## Basic Workflow

1. **First run**: Review the onboarding tour (shown once)
2. **Import**: Load your Rekordbox XML file
3. **Preflight**: Fix any validation errors or proceed past warnings
4. **Process**: Enrich tracks with Beatport data
5. **Run summary**: Review matches, unmatched, and output paths
6. **Review**: Check match scores and metadata
7. **Export**: Save results to file

## Batch Processing Workflow

1. Import multiple XML files (one at a time)
2. Process all tracks
3. Preflight validation runs before each playlist
4. Review matches in batches
5. Export each batch separately

## Quality Assurance Workflow

1. Process tracks
2. Filter by match score (< 80%)
3. Review low-score matches manually
4. Correct any mismatches
5. Re-export with corrections

## Export Workflow

1. Select tracks to export (or leave all selected)
2. Choose export format based on use case:
   - CSV for spreadsheets
   - JSON for programs
   - Excel for detailed analysis
3. Select destination folder
4. Export and verify file

## Preparing a Set

See [Prepare](prepare.md) for each step in full.

1. Right-click the Collection or playlist the night starts from and choose
   **New Set from…**, or select tracks in the Library and choose **New Set from
   the selection…**
2. On **Prepare**, right-click where each section begins and choose **Start a
   chapter here**; give a chapter a target length and a BPM range from its
   heading's menu
3. Select an entry and type its **Mix in** and **Mix out** times in the
   Inspector; the running time and **Starts at** follow
4. Select the entry before a gap and take a track from **Suggestions**, with
   **Insert here** or a drag
5. Read the **Transition** column; **Accept** a warning you have heard and
   are happy with
6. **Play Set** to hear it through, then **Export ▾** to save a set list or
   export it to Rekordbox as one playlist

## Troubleshooting Workflow

1. Check [Troubleshooting Guide](troubleshooting.md)
2. Generate support bundle (Help > Troubleshooting > Export support bundle...)
3. Check logs (Help > Troubleshooting > Log viewer...)
4. Report issue with support bundle attached

