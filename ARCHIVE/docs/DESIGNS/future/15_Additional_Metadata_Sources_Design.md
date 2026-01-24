# Design: Additional Metadata Source Integration

**Number**: 15  
**Status**: 📝 Planned  
**Priority**: 🚀 P2 - Larger Project  
**Effort**: 1-2 weeks per source  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

Single source (Beatport) limits metadata availability.

### 1.2 Solution Overview

Integrate additional metadata sources:
1. **Spotify API**: Genres, popularity, audio features
2. **Discogs API**: Vinyl releases, credits, labels
3. **Last.fm API**: Tags, similar artists, user data
4. **MusicBrainz**: Comprehensive metadata database

**Benefits**:
- **Backup source**: If Beatport fails, use alternative
- **Richer metadata**: More complete information
- **Cross-validation**: Verify matches against multiple sources
- **Enhanced matching**: Use additional data for better matching

---

## 2. Architecture Design

### 2.1 Metadata Source Abstraction

```
Query Track
    ↓
Metadata Source Interface
    ├─ Beatport (existing)
    ├─ Spotify (new)
    ├─ Discogs (new)
    ├─ Last.fm (new)
    └─ MusicBrainz (new)
    ↓
Aggregate Results
    ├─ Merge metadata
    ├─ Cross-validate
    └─ Select best source
```

### 2.2 Source Priority

**Priority Order**:
1. **Beatport** (primary) - Best for electronic music
2. **Spotify** (secondary) - Good genre/audio features
3. **MusicBrainz** (tertiary) - Comprehensive but slower
4. **Discogs** (vinyl-focused) - For vinyl releases
5. **Last.fm** (tags) - For additional tags/genres

---

## 3. Implementation Details

### 3.1 Metadata Source Interface

**Location**: `SRC/metadata_source.py` (new module)

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class TrackMetadata:
    """Unified track metadata structure"""
    title: str
    artists: List[str]
    album: Optional[str] = None
    release_date: Optional[str] = None
    genres: List[str] = None
    label: Optional[str] = None
    key: Optional[str] = None
    bpm: Optional[int] = None
    url: Optional[str] = None
    source: str = "unknown"  # "beatport", "spotify", etc.

class MetadataSource(ABC):
    """Abstract base class for metadata sources"""
    
    @abstractmethod
    async def search_track(self, title: str, artists: List[str]) -> List[TrackMetadata]:
        """Search for track metadata"""
        pass
    
    @abstractmethod
    async def get_track_details(self, track_id: str) -> Optional[TrackMetadata]:
        """Get detailed track metadata by ID"""
        pass
    
    @property
    @abstractmethod
    def source_name(self) -> str:
        """Return source name"""
        pass
```

### 3.2 Spotify Integration

**Location**: `SRC/spotify_source.py`

```python
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

class SpotifySource(MetadataSource):
    def __init__(self, client_id: str, client_secret: str):
        auth_manager = SpotifyClientCredentials(
            client_id=client_id,
            client_secret=client_secret
        )
        self.client = spotipy.Spotify(auth_manager=auth_manager)
    
    @property
    def source_name(self) -> str:
        return "spotify"
    
    async def search_track(self, title: str, artists: List[str]) -> List[TrackMetadata]:
        """Search Spotify for track"""
        query = f"track:{title} artist:{artists[0] if artists else ''}"
        results = self.client.search(q=query, type='track', limit=10)
        
        tracks = []
        for item in results['tracks']['items']:
            metadata = TrackMetadata(
                title=item['name'],
                artists=[artist['name'] for artist in item['artists']],
                album=item['album']['name'],
                release_date=item['album']['release_date'],
                genres=[],  # Track-level genres not available
                url=item['external_urls']['spotify'],
                source="spotify"
            )
            tracks.append(metadata)
        
        return tracks
    
    async def get_audio_features(self, track_id: str) -> Dict:
        """Get audio features (BPM, key, etc.)"""
        features = self.client.audio_features([track_id])[0]
        return {
            'bpm': int(features['tempo']) if features['tempo'] else None,
            'key': self._spotify_key_to_standard(features['key']),
            'energy': features['energy'],
            'danceability': features['danceability'],
        }
```

### 3.3 MusicBrainz Integration

**Location**: `SRC/musicbrainz_source.py`

```python
import musicbrainzngs

class MusicBrainzSource(MetadataSource):
    def __init__(self, user_agent: str = "CuePoint/1.0"):
        musicbrainzngs.set_useragent(user_agent, "1.0", "your-email@example.com")
    
    @property
    def source_name(self) -> str:
        return "musicbrainz"
    
    async def search_track(self, title: str, artists: List[str]) -> List[TrackMetadata]:
        """Search MusicBrainz for track"""
        results = musicbrainzngs.search_recordings(
            recording=title,
            artist=artists[0] if artists else None,
            limit=10
        )
        
        tracks = []
        for recording in results['recording-list']:
            metadata = TrackMetadata(
                title=recording['title'],
                artists=[a['name'] for a in recording.get('artist-credit', [])],
                release_date=recording.get('first-release-date'),
                source="musicbrainz"
            )
            tracks.append(metadata)
        
        return tracks
```

### 3.4 Metadata Aggregator

**Location**: `SRC/metadata_aggregator.py`

```python
class MetadataAggregator:
    """Aggregate metadata from multiple sources"""
    
    def __init__(self, sources: List[MetadataSource]):
        self.sources = sources
    
    async def get_comprehensive_metadata(
        self,
        title: str,
        artists: List[str]
    ) -> TrackMetadata:
        """Get metadata from all sources and merge"""
        all_results = []
        
        # Search all sources concurrently
        tasks = [source.search_track(title, artists) for source in self.sources]
        results_list = await asyncio.gather(*tasks)
        
        # Merge results
        merged = self._merge_metadata(results_list)
        return merged
    
    def _merge_metadata(self, results_list: List[List[TrackMetadata]]) -> TrackMetadata:
        """Merge metadata from multiple sources"""
        # Find best match across sources
        # Prioritize Beatport, then fill gaps from other sources
        beatport_result = next(
            (r for results in results_list 
             for r in results if r.source == "beatport"),
            None
        )
        
        if beatport_result:
            # Use Beatport as base, enrich from other sources
            spotify_result = next(
                (r for results in results_list 
                 for r in results if r.source == "spotify"),
                None
            )
            
            if spotify_result:
                # Merge genres, audio features
                beatport_result.genres.extend(spotify_result.genres or [])
                # ... merge other fields ...
        
        return beatport_result or results_list[0][0] if results_list else None
```

---

## 4. Configuration

### 4.1 API Keys

**Location**: `config.py` or environment variables

```python
SETTINGS = {
    "METADATA_SOURCES": ["beatport", "spotify"],  # Enabled sources
    "SPOTIFY_CLIENT_ID": os.getenv("SPOTIFY_CLIENT_ID"),
    "SPOTIFY_CLIENT_SECRET": os.getenv("SPOTIFY_CLIENT_SECRET"),
    "DISCOGS_USER_TOKEN": os.getenv("DISCOGS_USER_TOKEN"),
    "LASTFM_API_KEY": os.getenv("LASTFM_API_KEY"),
}
```

### 4.2 Environment Variables

```bash
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_CLIENT_SECRET="your_client_secret"
export DISCOGS_USER_TOKEN="your_token"
export LASTFM_API_KEY="your_api_key"
```

---

## 5. Source-Specific Details

### 5.1 Spotify API

**Capabilities**:
- Track metadata (title, artists, album)
- Audio features (BPM, key, energy, danceability)
- Genres (album/artist level)
- Popularity scores

**Rate Limits**: 10,000 requests/hour (generous)

**Authentication**: OAuth 2.0 Client Credentials

### 5.2 Discogs API

**Capabilities**:
- Release information
- Label information
- Artist credits
- Vinyl/format details

**Rate Limits**: 60 requests/minute

**Authentication**: User token

### 5.3 Last.fm API

**Capabilities**:
- Track tags/genres
- Similar artists
- User scrobbling data
- Track popularity

**Rate Limits**: Unclear (be respectful)

**Authentication**: API key

### 5.4 MusicBrainz

**Capabilities**:
- Comprehensive metadata
- Release information
- Artist relationships
- Label information

**Rate Limits**: 1 request/second

**Authentication**: User agent (email required)

---

## 6. Usage Examples

### 6.1 Enable Additional Sources

```yaml
# config.yaml
metadata:
  sources: ["beatport", "spotify"]
  spotify_client_id: "your_id"
  spotify_client_secret: "your_secret"
```

### 6.2 CLI Usage

```bash
# Use Spotify as backup
python main.py --xml collection.xml --playlist "My Playlist" \
    --metadata-sources beatport spotify
```

---

## 7. Benefits

### 7.1 Enhanced Metadata

- **Richer information**: More complete track data
- **Audio features**: BPM, key from Spotify
- **Genre diversity**: Multiple genre sources

### 7.2 Reliability

- **Backup sources**: If Beatport fails, use alternative
- **Cross-validation**: Verify matches
- **Fallback**: Always have a source available

---

## 8. Challenges

### 8.1 API Keys

- **User registration**: Users need to register for APIs
- **Rate limiting**: Different limits per source
- **Authentication**: Complex OAuth flows

### 8.2 Data Consistency

- **Different formats**: Each source has different data structure
- **Normalization**: Need to normalize across sources
- **Conflicts**: What if sources disagree?

---

## 9. Dependencies

### 9.1 Additional Packages

```
spotipy>=2.23.0          # Spotify API
python-discogs>=2.3.0    # Discogs API
musicbrainzngs>=0.7.0     # MusicBrainz API
pylast>=5.0.0            # Last.fm API
```

---

## 10. Future Enhancements

### 10.1 Potential Improvements

1. **Smart source selection**: Automatically choose best source
2. **Metadata caching**: Cache results across sources
3. **Confidence scoring**: Rate metadata quality
4. **Batch requests**: Optimize API usage

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

