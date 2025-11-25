# Step 6.2: Implement Dependency Injection & Service Layer

**Status**: 📝 Planned  
**Priority**: 🚀 P1 - HIGH PRIORITY  
**Estimated Duration**: 3-4 days  
**Dependencies**: Step 6.1 (Project Structure)

---

## Goal

Decouple components using dependency injection and create a service layer that provides clear interfaces for business logic, data access, and application services. This enables better testability, maintainability, and flexibility.

---

## Success Criteria

- [ ] Service interfaces/abstract base classes created
- [ ] Dependency injection container implemented
- [ ] Existing code refactored to use services
- [ ] Direct dependencies between components removed
- [ ] Circular dependencies eliminated
- [ ] Services are testable in isolation
- [ ] Service interfaces documented

---

## Why Dependency Injection?

### Current Problems
- Components directly instantiate dependencies
- Hard to test (can't easily mock dependencies)
- Tight coupling between components
- Difficult to swap implementations
- Circular dependencies possible

### Benefits After DI
- **Testability**: Easy to inject mocks for testing
- **Flexibility**: Can swap implementations easily
- **Decoupling**: Components don't know about concrete implementations
- **Maintainability**: Changes to one component don't affect others
- **Reusability**: Services can be reused across features

---

## Service Layer Architecture

### Service Interfaces (Abstract Base Classes)

```python
# src/cuepoint/services/interfaces.py

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult

class IProcessorService(ABC):
    """Interface for track processing service."""
    
    @abstractmethod
    def process_track(self, track: Track) -> TrackResult:
        """Process a single track and return result."""
        pass
    
    @abstractmethod
    def process_playlist(self, tracks: List[Track]) -> List[TrackResult]:
        """Process a playlist of tracks."""
        pass

class IBeatportService(ABC):
    """Interface for Beatport API access."""
    
    @abstractmethod
    def search_tracks(self, query: str) -> List[Dict[str, Any]]:
        """Search for tracks on Beatport."""
        pass
    
    @abstractmethod
    def fetch_track_data(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch track data from Beatport URL."""
        pass

class ICacheService(ABC):
    """Interface for caching service."""
    
    @abstractmethod
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        pass
    
    @abstractmethod
    def clear(self) -> None:
        """Clear all cache entries."""
        pass

class IExportService(ABC):
    """Interface for export operations."""
    
    @abstractmethod
    def export_to_csv(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to CSV file."""
        pass
    
    @abstractmethod
    def export_to_json(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to JSON file."""
        pass
    
    @abstractmethod
    def export_to_excel(self, results: List[TrackResult], filepath: str) -> None:
        """Export results to Excel file."""
        pass

class IConfigService(ABC):
    """Interface for configuration management."""
    
    @abstractmethod
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any) -> None:
        """Set configuration value."""
        pass
    
    @abstractmethod
    def save(self) -> None:
        """Save configuration to persistent storage."""
        pass
    
    @abstractmethod
    def load(self) -> None:
        """Load configuration from persistent storage."""
        pass

class ILoggingService(ABC):
    """Interface for logging service."""
    
    @abstractmethod
    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        pass
    
    @abstractmethod
    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        pass
    
    @abstractmethod
    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        pass
    
    @abstractmethod
    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        pass
```

---

## Dependency Injection Container

### Simple DI Container Implementation

```python
# src/cuepoint/utils/di_container.py

from typing import Dict, Type, TypeVar, Callable, Any, Optional
from functools import lru_cache

T = TypeVar('T')

class DIContainer:
    """
    Simple dependency injection container.
    Manages service registration and resolution.
    """
    
    def __init__(self):
        self._services: Dict[Type, Any] = {}
        self._factories: Dict[Type, Callable] = {}
        self._singletons: Dict[Type, Any] = {}
    
    def register_singleton(self, interface: Type[T], implementation: T) -> None:
        """Register a singleton instance."""
        self._singletons[interface] = implementation
    
    def register_factory(self, interface: Type[T], factory: Callable[[], T]) -> None:
        """Register a factory function for creating instances."""
        self._factories[interface] = factory
    
    def register_transient(self, interface: Type[T], implementation: Type[T]) -> None:
        """Register a transient service (new instance each time)."""
        self._services[interface] = implementation
    
    def resolve(self, interface: Type[T]) -> T:
        """Resolve a service instance."""
        # Check singletons first
        if interface in self._singletons:
            return self._singletons[interface]
        
        # Check factories
        if interface in self._factories:
            instance = self._factories[interface]()
            return instance
        
        # Check transient services
        if interface in self._services:
            impl_class = self._services[interface]
            # Resolve dependencies for constructor
            instance = self._create_instance(impl_class)
            return instance
        
        raise ValueError(f"Service {interface} not registered")
    
    def _create_instance(self, cls: Type) -> Any:
        """Create an instance of a class, resolving its dependencies."""
        import inspect
        sig = inspect.signature(cls.__init__)
        params = {}
        
        for param_name, param in sig.parameters.items():
            if param_name == 'self':
                continue
            if param.annotation != inspect.Parameter.empty:
                try:
                    params[param_name] = self.resolve(param.annotation)
                except ValueError:
                    # If dependency not registered, use default or None
                    if param.default != inspect.Parameter.empty:
                        params[param_name] = param.default
                    else:
                        raise ValueError(f"Cannot resolve dependency {param_name} for {cls}")
        
        return cls(**params)
    
    def is_registered(self, interface: Type) -> bool:
        """Check if a service is registered."""
        return (interface in self._singletons or 
                interface in self._factories or 
                interface in self._services)

# Global container instance
_container: Optional[DIContainer] = None

def get_container() -> DIContainer:
    """Get the global DI container instance."""
    global _container
    if _container is None:
        _container = DIContainer()
    return _container

def reset_container() -> None:
    """Reset the global container (useful for testing)."""
    global _container
    _container = None
```

---

## Service Implementations

### Processor Service Implementation

```python
# src/cuepoint/services/processor_service.py

from typing import List
from cuepoint.services.interfaces import IProcessorService, IBeatportService, IMatcherService, ILoggingService
from cuepoint.models.track import Track
from cuepoint.models.result import TrackResult

class ProcessorService(IProcessorService):
    """Implementation of track processing service."""
    
    def __init__(
        self,
        beatport_service: IBeatportService,
        matcher_service: IMatcherService,
        logging_service: ILoggingService
    ):
        self.beatport_service = beatport_service
        self.matcher_service = matcher_service
        self.logging_service = logging_service
    
    def process_track(self, track: Track) -> TrackResult:
        """Process a single track."""
        self.logging_service.info(f"Processing track: {track.title}")
        
        # Search for candidates
        candidates = self.beatport_service.search_tracks(
            f"{track.artist} {track.title}"
        )
        
        # Find best match
        best_match = self.matcher_service.find_best_match(track, candidates)
        
        # Create result
        result = TrackResult(
            track=track,
            best_match=best_match,
            candidates=candidates
        )
        
        return result
    
    def process_playlist(self, tracks: List[Track]) -> List[TrackResult]:
        """Process a playlist of tracks."""
        results = []
        for track in tracks:
            result = self.process_track(track)
            results.append(result)
        return results
```

### Beatport Service Implementation

```python
# src/cuepoint/services/beatport_service.py

from typing import List, Dict, Any, Optional
from cuepoint.services.interfaces import IBeatportService, ICacheService, ILoggingService
from cuepoint.data.beatport import search_track_urls, fetch_track_data

class BeatportService(IBeatportService):
    """Implementation of Beatport API service."""
    
    def __init__(
        self,
        cache_service: ICacheService,
        logging_service: ILoggingService
    ):
        self.cache_service = cache_service
        self.logging_service = logging_service
    
    def search_tracks(self, query: str) -> List[Dict[str, Any]]:
        """Search for tracks on Beatport."""
        # Check cache first
        cache_key = f"search:{query}"
        cached = self.cache_service.get(cache_key)
        if cached:
            self.logging_service.debug(f"Cache hit for query: {query}")
            return cached
        
        # Perform search
        self.logging_service.info(f"Searching Beatport for: {query}")
        urls = search_track_urls(query)
        
        # Fetch track data for each URL
        tracks = []
        for url in urls:
            track_data = self.fetch_track_data(url)
            if track_data:
                tracks.append(track_data)
        
        # Cache results
        self.cache_service.set(cache_key, tracks, ttl=3600)
        
        return tracks
    
    def fetch_track_data(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch track data from Beatport URL."""
        # Check cache
        cache_key = f"track:{url}"
        cached = self.cache_service.get(cache_key)
        if cached:
            return cached
        
        # Fetch from API
        track_data = fetch_track_data(url)
        
        # Cache result
        if track_data:
            self.cache_service.set(cache_key, track_data, ttl=86400)
        
        return track_data
```

### Cache Service Implementation

```python
# src/cuepoint/services/cache_service.py

from typing import Any, Optional
from cuepoint.services.interfaces import ICacheService
from cuepoint.data.cache import Cache

class CacheService(ICacheService):
    """Implementation of caching service."""
    
    def __init__(self, cache: Cache):
        self.cache = cache
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        return self.cache.get(key)
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache."""
        self.cache.set(key, value, ttl=ttl)
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self.cache.clear()
```

---

## Service Registration

### Bootstrap Function

```python
# src/cuepoint/services/bootstrap.py

from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import (
    IProcessorService, IBeatportService, ICacheService,
    IExportService, IConfigService, ILoggingService
)
from cuepoint.services.processor_service import ProcessorService
from cuepoint.services.beatport_service import BeatportService
from cuepoint.services.cache_service import CacheService
from cuepoint.services.export_service import ExportService
from cuepoint.services.config_service import ConfigService
from cuepoint.services.logging_service import LoggingService
from cuepoint.data.cache import Cache
from cuepoint.models.config import Config

def bootstrap_services() -> None:
    """Register all services with the DI container."""
    container = get_container()
    
    # Register logging service first (needed by others)
    logging_service = LoggingService()
    container.register_singleton(ILoggingService, logging_service)
    
    # Register config service
    config = Config.load()
    config_service = ConfigService(config)
    container.register_singleton(IConfigService, config_service)
    
    # Register cache service
    cache = Cache()
    cache_service = CacheService(cache)
    container.register_singleton(ICacheService, cache_service)
    
    # Register Beatport service
    def create_beatport_service() -> IBeatportService:
        return BeatportService(
            beatport_service=container.resolve(ICacheService),
            logging_service=container.resolve(ILoggingService)
        )
    container.register_factory(IBeatportService, create_beatport_service)
    
    # Register processor service
    def create_processor_service() -> IProcessorService:
        return ProcessorService(
            beatport_service=container.resolve(IBeatportService),
            matcher_service=container.resolve(IMatcherService),
            logging_service=container.resolve(ILoggingService)
        )
    container.register_factory(IProcessorService, create_processor_service)
    
    # Register export service
    export_service = ExportService()
    container.register_singleton(IExportService, export_service)
```

---

## Refactoring Existing Code

### Before (Direct Dependencies)

```python
# OLD: Direct instantiation
from cuepoint.data.beatport import search_track_urls
from cuepoint.core.matcher import best_beatport_match

class Processor:
    def process_track(self, track):
        # Direct dependency
        urls = search_track_urls(f"{track.artist} {track.title}")
        match = best_beatport_match(track, urls)
        return match
```

### After (Dependency Injection)

```python
# NEW: Dependency injection
from cuepoint.services.interfaces import IProcessorService, IBeatportService

class Processor:
    def __init__(self, processor_service: IProcessorService):
        self.processor_service = processor_service
    
    def process_track(self, track):
        # Use injected service
        return self.processor_service.process_track(track)
```

### UI Controller Refactoring

```python
# src/cuepoint/ui/controllers/main_controller.py

from cuepoint.services.interfaces import IProcessorService, IExportService
from cuepoint.models.track import Track

class MainController:
    """Controller for main window."""
    
    def __init__(
        self,
        processor_service: IProcessorService,
        export_service: IExportService
    ):
        self.processor_service = processor_service
        self.export_service = export_service
    
    def process_playlist(self, tracks: List[Track]) -> List[TrackResult]:
        """Process a playlist."""
        return self.processor_service.process_playlist(tracks)
    
    def export_results(self, results: List[TrackResult], filepath: str, format: str):
        """Export results."""
        if format == "csv":
            self.export_service.export_to_csv(results, filepath)
        elif format == "json":
            self.export_service.export_to_json(results, filepath)
        elif format == "excel":
            self.export_service.export_to_excel(results, filepath)
```

---

## Testing with Dependency Injection

### Mock Services for Testing

```python
# tests/unit/test_processor_service.py

from unittest.mock import Mock
from cuepoint.services.processor_service import ProcessorService
from cuepoint.models.track import Track

def test_process_track():
    # Create mocks
    mock_beatport = Mock()
    mock_beatport.search_tracks.return_value = [
        {"title": "Test Track", "artist": "Test Artist"}
    ]
    
    mock_matcher = Mock()
    mock_matcher.find_best_match.return_value = {"title": "Test Track"}
    
    mock_logging = Mock()
    
    # Create service with mocks
    service = ProcessorService(
        beatport_service=mock_beatport,
        matcher_service=mock_matcher,
        logging_service=mock_logging
    )
    
    # Test
    track = Track(title="Test", artist="Test Artist")
    result = service.process_track(track)
    
    # Verify
    assert result is not None
    mock_beatport.search_tracks.assert_called_once()
    mock_matcher.find_best_match.assert_called_once()
```

---

## Implementation Checklist

- [ ] Create service interfaces (`interfaces.py`)
- [ ] Implement DI container (`di_container.py`)
- [ ] Implement processor service
- [ ] Implement Beatport service
- [ ] Implement cache service
- [ ] Implement export service
- [ ] Implement config service
- [ ] Implement logging service
- [ ] Create bootstrap function
- [ ] Refactor processor to use services
- [ ] Refactor UI controllers to use services
- [ ] Remove direct dependencies
- [ ] Eliminate circular dependencies
- [ ] Write unit tests for services
- [ ] Write integration tests
- [ ] Document service interfaces
- [ ] Update existing code to use DI container

---

## Common Issues and Solutions

### Issue 1: Circular Dependencies
**Solution**: Use dependency injection to break cycles. Services should depend on interfaces, not concrete implementations.

### Issue 2: Service Not Registered
**Solution**: Ensure all services are registered in bootstrap function. Check registration order (dependencies first).

### Issue 3: Too Many Dependencies
**Solution**: Consider splitting services into smaller, more focused services. Use composition.

---

## Next Steps

After completing this step:
1. Verify all services work correctly
2. Run tests to ensure functionality preserved
3. Proceed to Step 6.3: Separate Business Logic from UI

