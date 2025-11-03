# Design: JSON Output Format

**Number**: 9  
**Status**: 📝 Planned  
**Priority**: ⚡ P1 - Medium Effort  
**Effort**: 2-3 days  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

CSV format has limitations:
- All values are strings (no type preservation)
- Not ideal for API integration
- Difficult for programmatic processing

### 1.2 Solution Overview

Add JSON output option:
1. Structured data format
2. Type preservation
3. API-friendly
4. Easy programmatic access

---

## 2. Architecture Design

### 2.1 Output Format Selection

```
Processing Complete
    ↓
Format Selection
    ├─ CSV only (default)
    ├─ JSON only
    └─ Both formats
    ↓
Generate Output Files
    ├─ CSV files (existing)
    └─ JSON files (new)
```

### 2.2 JSON Structure Design

**Nested structure for better organization**:
```json
{
  "metadata": {
    "playlist_name": "My Playlist",
    "xml_file": "collection.xml",
    "processed_at": "2025-11-03T18:50:58",
    "total_tracks": 11,
    "processing_time_seconds": 342.5
  },
  "tracks": [
    {
      "playlist_index": 1,
      "original": {
        "title": "The Night is Blue",
        "artists": "Tim Green"
      },
      "match": {
        "found": true,
        "title": "The Night is Blue Original Mix",
        "artists": "Tim Green",
        "beatport_url": "https://www.beatport.com/track/the-night-is-blue/12345",
        "beatport_track_id": "12345",
        "scores": {
          "match_score": 139.0,
          "title_sim": 100.0,
          "artist_sim": 100.0
        },
        "metadata": {
          "key": "G Major",
          "key_camelot": "9B",
          "year": 2023,
          "bpm": 128,
          "label": "Anjunadeep",
          "genres": ["Melodic House & Techno", "Progressive House"],
          "release": "Anjunadeep 14",
          "release_date": "2023-03-24"
        },
        "confidence": "high"
      },
      "candidates_evaluated": 25,
      "queries_executed": 5
    },
    {
      "playlist_index": 2,
      "original": {
        "title": "Unmatched Track",
        "artists": "Unknown Artist"
      },
      "match": {
        "found": false
      },
      "candidates_evaluated": 0,
      "queries_executed": 8
    }
  ],
  "statistics": {
    "matched": 10,
    "unmatched": 1,
    "review_needed": 0,
    "match_rate": 90.9,
    "average_score": 130.5,
    "confidence_distribution": {
      "high": 9,
      "medium": 1,
      "low": 0
    },
    "performance": {
      "total_queries": 62,
      "total_candidates": 743,
      "early_exits": 2
    },
    "genres": {
      "Melodic House & Techno": 7,
      "Afro House": 5
    }
  }
}
```

---

## 3. Implementation Details

### 3.1 CLI Argument

**Location**: `SRC/main.py`

```python
ap.add_argument(
    "--format",
    choices=["csv", "json", "both"],
    default="csv",
    help="Output format: csv (default), json, or both"
)
```

### 3.2 JSON Generation Function

**Location**: `SRC/processor.py`

```python
import json
from datetime import datetime

def generate_json_output(
    playlist_name: str,
    xml_path: str,
    tracks_data: List[Dict],
    statistics: ProcessingStats,
    processing_time: float,
    output_path: str
) -> str:
    """
    Generate JSON output file
    
    Args:
        playlist_name: Name of processed playlist
        xml_path: Path to XML file
        tracks_data: List of track data dictionaries
        statistics: Processing statistics
        processing_time: Total processing time in seconds
        output_path: Path to save JSON file
    
    Returns:
        Path to generated JSON file
    """
    # Build JSON structure
    json_data = {
        "metadata": {
            "playlist_name": playlist_name,
            "xml_file": os.path.basename(xml_path),
            "processed_at": datetime.now().isoformat(),
            "total_tracks": len(tracks_data),
            "processing_time_seconds": processing_time
        },
        "tracks": [],
        "statistics": build_statistics_json(statistics)
    }
    
    # Convert track data to JSON structure
    for track_data in tracks_data:
        json_track = {
            "playlist_index": track_data['playlist_index'],
            "original": {
                "title": track_data['original_title'],
                "artists": track_data['original_artists']
            }
        }
        
        if track_data.get('beatport_title'):
            json_track["match"] = {
                "found": True,
                "title": track_data['beatport_title'],
                "artists": track_data['beatport_artists'],
                "beatport_url": track_data['beatport_url'],
                "beatport_track_id": track_data.get('beatport_track_id'),
                "scores": {
                    "match_score": float(track_data.get('match_score', 0)),
                    "title_sim": float(track_data.get('title_sim', 0)),
                    "artist_sim": float(track_data.get('artist_sim', 0))
                },
                "metadata": {
                    "key": track_data.get('beatport_key'),
                    "key_camelot": track_data.get('beatport_key_camelot'),
                    "year": int(track_data['beatport_year']) if track_data.get('beatport_year') else None,
                    "bpm": int(track_data['beatport_bpm']) if track_data.get('beatport_bpm') else None,
                    "label": track_data.get('beatport_label'),
                    "genres": track_data.get('beatport_genres', '').split(', ') if track_data.get('beatport_genres') else [],
                    "release": track_data.get('beatport_release'),
                    "release_date": track_data.get('beatport_release_date')
                },
                "confidence": track_data.get('confidence', 'unknown')
            }
        else:
            json_track["match"] = {
                "found": False
            }
        
        json_track["candidates_evaluated"] = track_data.get('candidates_evaluated', 0)
        json_track["queries_executed"] = track_data.get('queries_executed', 0)
        
        json_data["tracks"].append(json_track)
    
    # Write JSON file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)
    
    return output_path

def build_statistics_json(stats: ProcessingStats) -> Dict:
    """Build statistics section for JSON"""
    return {
        "matched": stats.matched_count,
        "unmatched": stats.unmatched_count,
        "review_needed": stats.review_needed_count,
        "match_rate": (stats.matched_count / stats.total_tracks * 100) if stats.total_tracks > 0 else 0,
        "average_score": sum(stats.scores) / len(stats.scores) if stats.scores else 0,
        "confidence_distribution": {
            "high": stats.high_confidence,
            "medium": stats.medium_confidence,
            "low": stats.low_confidence
        },
        "performance": {
            "total_queries": stats.total_queries,
            "total_candidates": stats.total_candidates,
            "early_exits": stats.early_exits
        },
        "genres": stats.genres
    }
```

### 3.3 Integration with Processor

**Location**: `SRC/processor.py` → `run()`

```python
def run(xml_path: str, playlist_name: str, out_csv_base: str, auto_research: bool = False):
    # ... existing processing ...
    
    # Generate CSV output (existing)
    if output_format in ['csv', 'both']:
        write_csv_files(main_rows, cand_rows, queries_rows, out_main, ...)
    
    # Generate JSON output (new)
    if output_format in ['json', 'both']:
        json_path = os.path.join(output_dir, f"{base_filename}.json")
        generate_json_output(
            playlist_name, xml_path, main_rows,
            stats, processing_time, json_path
        )
        print(f"JSON output: {json_path}")
```

---

## 4. JSON File Structure Details

### 4.1 Metadata Section

```json
{
  "metadata": {
    "playlist_name": "String - Playlist name from XML",
    "xml_file": "String - Basename of XML file",
    "processed_at": "ISO 8601 timestamp",
    "total_tracks": "Integer - Number of tracks",
    "processing_time_seconds": "Float - Processing duration"
  }
}
```

### 4.2 Track Object Structure

**With Match**:
```json
{
  "playlist_index": 1,
  "original": {
    "title": "String",
    "artists": "String"
  },
  "match": {
    "found": true,
    "title": "String",
    "artists": "String",
    "beatport_url": "String (URL)",
    "beatport_track_id": "String",
    "scores": {
      "match_score": "Float",
      "title_sim": "Float (0-100)",
      "artist_sim": "Float (0-100)"
    },
    "metadata": {
      "key": "String or null",
      "key_camelot": "String or null",
      "year": "Integer or null",
      "bpm": "Integer or null",
      "label": "String or null",
      "genres": ["Array of strings"],
      "release": "String or null",
      "release_date": "String or null (ISO date)"
    },
    "confidence": "String: 'high' | 'medium' | 'low'"
  },
  "candidates_evaluated": "Integer",
  "queries_executed": "Integer"
}
```

**Without Match**:
```json
{
  "playlist_index": 2,
  "original": {
    "title": "String",
    "artists": "String"
  },
  "match": {
    "found": false
  },
  "candidates_evaluated": "Integer",
  "queries_executed": "Integer"
}
```

### 4.3 Statistics Section

```json
{
  "statistics": {
    "matched": "Integer",
    "unmatched": "Integer",
    "review_needed": "Integer",
    "match_rate": "Float (percentage)",
    "average_score": "Float",
    "confidence_distribution": {
      "high": "Integer",
      "medium": "Integer",
      "low": "Integer"
    },
    "performance": {
      "total_queries": "Integer",
      "total_candidates": "Integer",
      "early_exits": "Integer"
    },
    "genres": {
      "Genre Name": "Integer count"
    }
  }
}
```

---

## 5. File Naming

### 5.1 JSON File Pattern

**Pattern**: `{output_base}.json`

**Example**: `test_output (2025-11-03 18-50-58).json`

### 5.2 Both Formats

When `--format both`:
```
output/
├── test_output (2025-11-03 18-50-58).csv
├── test_output (2025-11-03 18-50-58).json
├── test_output (2025-11-03 18-50-58)_candidates.csv
├── test_output (2025-11-03 18-50-58)_queries.csv
└── test_output (2025-11-03 18-50-58)_review.csv
```

---

## 6. Advantages of JSON Format

### 6.1 Type Preservation

- **Numbers**: Preserved as integers/floats (not strings)
- **Booleans**: True/false (not "True"/"False")
- **Null values**: Explicit null instead of empty strings
- **Arrays**: Proper list structures

### 6.2 API Integration

```python
# Easy to consume in Python
import json
with open('output.json') as f:
    data = json.load(f)
    
for track in data['tracks']:
    if track['match']['found']:
        print(f"Matched: {track['original']['title']}")
```

```javascript
// Easy to consume in JavaScript/Node.js
const data = require('./output.json');
data.tracks.forEach(track => {
    if (track.match.found) {
        console.log(`Matched: ${track.original.title}`);
    }
});
```

### 6.3 Structured Data

- **Hierarchical**: Nested structure matches data relationships
- **Self-documenting**: Structure reveals data organization
- **Easy to query**: Can use JSONPath or similar tools

---

## 7. Configuration Options

### 7.1 Settings

```python
SETTINGS = {
    "OUTPUT_FORMAT": "csv",  # "csv", "json", or "both"
    "JSON_INDENT": 2,        # JSON indentation (2 for pretty, None for compact)
    "JSON_ENSURE_ASCII": False,  # Preserve Unicode characters
}
```

---

## 8. Usage Examples

### 8.1 JSON Only

```bash
python main.py --xml collection.xml --playlist "My Playlist" --format json
```

### 8.2 Both Formats

```bash
python main.py --xml collection.xml --playlist "My Playlist" --format both
```

### 8.3 Programmatic Access

```python
import json

# Load and process JSON output
with open('output.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Filter high-confidence matches
high_confidence = [
    track for track in data['tracks']
    if track['match'].get('confidence') == 'high'
]

# Calculate statistics
match_rate = data['statistics']['match_rate']
print(f"Match rate: {match_rate}%")
```

---

## 9. Performance Considerations

### 9.1 File Size

- **JSON**: Typically 10-20% larger than CSV (due to structure)
- **Compression**: JSON compresses well (can gzip if needed)
- **Memory**: Similar memory usage during generation

### 9.2 Generation Time

- **Overhead**: Minimal (~5-10ms per track)
- **Serialization**: Fast with Python's built-in json module

---

## 10. Future Enhancements

### 10.1 Potential Improvements

1. **JSON Streaming**: For very large playlists (streaming JSON)
2. **JSONL Format**: Newline-delimited JSON for easier processing
3. **Schema Definition**: JSON Schema for validation
4. **Compression**: Optional gzip compression
5. **Incremental Updates**: Append to existing JSON file

---

## 11. Benefits

### 11.1 Programmatic Access

- **API Integration**: Easy to build APIs on top
- **Database Import**: Direct import to document databases
- **Script Automation**: Easy parsing and processing

### 11.2 Data Quality

- **Type Safety**: Preserved types prevent conversion errors
- **Structure**: Hierarchical organization
- **Validation**: Can validate against schema

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

