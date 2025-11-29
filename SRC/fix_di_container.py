#!/usr/bin/env python3
"""Fix di_container.py file"""

content = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Dependency Injection Container

Simple dependency injection container for managing service registration and resolution.
Supports singleton, factory, and transient service registration.
"""

from typing import Dict, Type, TypeVar, Callable, Any, Optional
import inspect

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
    
    def clear(self) -> None:
        """Clear all registrations (useful for testing)."""
        self._services.clear()
        self._factories.clear()
        self._singletons.clear()


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
'''

import os
path = os.path.join(os.path.dirname(__file__), 'cuepoint', 'utils', 'di_container.py')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f"File written to {path}")
print(f"File size: {os.path.getsize(path)} bytes")






