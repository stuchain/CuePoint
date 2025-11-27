#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Dependency Injection Container

Simple dependency injection container for managing service registration and resolution.
Supports singleton, factory, and transient service registration.
"""

import inspect
from typing import Any, Callable, Dict, Optional, Type, TypeVar

T = TypeVar("T")


class DIContainer:
    """
    Simple dependency injection container.

    Manages service registration and resolution. Supports three registration
    patterns:
    - Singleton: Single instance shared across all resolutions
    - Factory: Function called to create new instances
    - Transient: New instance created each time (with dependency resolution)

    Example:
        >>> container = DIContainer()
        >>> container.register_singleton(IService, ServiceImpl())
        >>> service = container.resolve(IService)
    """

    def __init__(self) -> None:
        """Initialize empty dependency injection container."""
        self._services: Dict[Type[Any], Type[Any]] = {}
        self._factories: Dict[Type[Any], Callable[[], Any]] = {}
        self._singletons: Dict[Type[Any], Any] = {}

    def register_singleton(self, interface: Type[T], implementation: T) -> None:
        """Register a singleton instance.

        Args:
            interface: The interface/type to register.
            implementation: The instance to return for all resolutions.

        Example:
            >>> container.register_singleton(ILogger, Logger())
        """
        self._singletons[interface] = implementation

    def register_factory(self, interface: Type[T], factory: Callable[[], T]) -> None:
        """Register a factory function for creating instances.

        Args:
            interface: The interface/type to register.
            factory: Function that returns an instance of the interface.

        Example:
            >>> container.register_factory(IService, lambda: ServiceImpl())
        """
        self._factories[interface] = factory

    def register_transient(self, interface: Type[T], implementation: Type[T]) -> None:
        """Register a transient service (new instance each time).

        Args:
            interface: The interface/type to register.
            implementation: The class to instantiate for each resolution.

        Example:
            >>> container.register_transient(IService, ServiceImpl)
        """
        self._services[interface] = implementation

    def resolve(self, interface: Type[T]) -> T:
        """Resolve a service instance.

        Checks singletons first, then factories, then transient services.
        For transient services, automatically resolves constructor dependencies.

        Args:
            interface: The interface/type to resolve.

        Returns:
            An instance of the requested interface.

        Raises:
            ValueError: If the service is not registered.

        Example:
            >>> service = container.resolve(IService)
        """
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

    def _create_instance(self, cls: Type[Any]) -> Any:
        """Create an instance of a class, resolving its dependencies.

        Inspects the class constructor and automatically resolves dependencies
        using the container. If a dependency is not registered and has no
        default value, raises ValueError.

        Args:
            cls: The class to instantiate.

        Returns:
            A new instance of the class with dependencies resolved.

        Raises:
            ValueError: If a required dependency is not registered.
        """
        sig = inspect.signature(cls.__init__)
        params = {}

        for param_name, param in sig.parameters.items():
            if param_name == "self":
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

    def is_registered(self, interface: Type[Any]) -> bool:
        """Check if a service is registered.

        Args:
            interface: The interface/type to check.

        Returns:
            True if the service is registered (as singleton, factory, or transient),
            False otherwise.

        Example:
            >>> if container.is_registered(IService):
            ...     service = container.resolve(IService)
        """
        return (
            interface in self._singletons
            or interface in self._factories
            or interface in self._services
        )

    def clear(self) -> None:
        """Clear all registrations (useful for testing).

        Removes all singleton, factory, and transient registrations.
        """
        self._services.clear()
        self._factories.clear()
        self._singletons.clear()


# Global container instance
_container: Optional[DIContainer] = None


def get_container() -> DIContainer:
    """Get the global DI container instance.

    Creates a new container if one doesn't exist. Uses singleton pattern
    to ensure only one global container instance exists.

    Returns:
        The global DIContainer instance.

    Example:
        >>> container = get_container()
        >>> container.register_singleton(IService, ServiceImpl())
    """
    global _container
    if _container is None:
        _container = DIContainer()
    return _container


def reset_container() -> None:
    """Reset the global container (useful for testing).

    Clears the global container instance, allowing a fresh container
    to be created on the next get_container() call.

    Example:
        >>> reset_container()  # Clear global state
        >>> container = get_container()  # Get fresh container
    """
    global _container
    _container = None
