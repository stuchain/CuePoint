#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Interface conformance and DI registration (FOUNDATION-01).

Every service that participates in dependency injection should be addressable
through an interface, so later work can depend on contracts rather than
concrete classes.
"""

from __future__ import annotations

import inspect

import pytest

from cuepoint.services.checkpoint_service import CheckpointService
from cuepoint.services.incrate_discovery_service import IncrateDiscoveryService
from cuepoint.services.interfaces import (
    IBeatportService,
    ICacheService,
    ICheckpointService,
    IConfigService,
    IExportService,
    IIncrateDiscoveryService,
    IInventoryService,
    ILoggingService,
    IMatcherService,
    IOnboardingService,
    IPrivacyService,
    IProcessorService,
    ISecurityService,
    ITelemetryService,
)
from cuepoint.services.inventory_service import InventoryService
from cuepoint.services.onboarding_service import OnboardingService
from cuepoint.services.privacy_service import PrivacyService
from cuepoint.services.security_service import SecurityService

# Interfaces added by FOUNDATION-01, paired with their concrete implementation.
_NEW_INTERFACE_PAIRS = [
    (PrivacyService, IPrivacyService),
    (OnboardingService, IOnboardingService),
    (InventoryService, IInventoryService),
    (IncrateDiscoveryService, IIncrateDiscoveryService),
    (SecurityService, ISecurityService),
    (CheckpointService, ICheckpointService),
]


@pytest.mark.unit
class TestInterfaceConformance:
    @pytest.mark.parametrize(
        "impl,interface",
        _NEW_INTERFACE_PAIRS,
        ids=lambda v: getattr(v, "__name__", str(v)),
    )
    def test_implements_interface(self, impl, interface):
        assert issubclass(impl, interface)

    @pytest.mark.parametrize(
        "impl,interface",
        _NEW_INTERFACE_PAIRS,
        ids=lambda v: getattr(v, "__name__", str(v)),
    )
    def test_no_unimplemented_abstract_methods(self, impl, interface):
        """A concrete service must be instantiable (no abstract leftovers)."""
        assert not getattr(impl, "__abstractmethods__", frozenset()), (
            f"{impl.__name__} leaves abstract methods unimplemented: "
            f"{sorted(impl.__abstractmethods__)}"
        )

    @pytest.mark.parametrize(
        "impl,interface",
        _NEW_INTERFACE_PAIRS,
        ids=lambda v: getattr(v, "__name__", str(v)),
    )
    def test_signatures_match_interface(self, impl, interface):
        """Implementation signatures must match the declared contract.

        Guards against an interface drifting away from its implementation.
        """
        mismatches = []
        for name in sorted(
            n
            for n, m in vars(interface).items()
            if getattr(m, "__isabstractmethod__", False)
            or isinstance(m, property)
            and getattr(m.fget, "__isabstractmethod__", False)
        ):
            iface_attr = getattr(interface, name)
            impl_attr = getattr(impl, name, None)
            if impl_attr is None:
                mismatches.append(f"{name}: missing on {impl.__name__}")
                continue
            if isinstance(inspect.getattr_static(interface, name), property):
                continue  # properties compared by presence only
            iface_params = list(inspect.signature(iface_attr).parameters)
            impl_params = list(inspect.signature(impl_attr).parameters)
            # staticmethod implementations legitimately drop "self"
            is_static = isinstance(
                inspect.getattr_static(impl, name, None), staticmethod
            )
            if is_static and iface_params[:1] == ["self"]:
                iface_params = iface_params[1:]
            if iface_params != impl_params:
                mismatches.append(
                    f"{name}: interface{iface_params} != impl{impl_params}"
                )
        assert not mismatches, "\n".join(mismatches)


@pytest.mark.unit
class TestBootstrapRegistration:
    """bootstrap_services() must register services against their interfaces."""

    @pytest.fixture
    def container(self, di_container):
        from cuepoint.services.bootstrap import bootstrap_services

        bootstrap_services()
        return di_container

    @pytest.mark.parametrize(
        "interface",
        [
            ILoggingService,
            IConfigService,
            ICacheService,
            IMatcherService,
            IBeatportService,
            IProcessorService,
            IExportService,
            ITelemetryService,
            IInventoryService,
            IIncrateDiscoveryService,
            IPrivacyService,
            IOnboardingService,
        ],
        ids=lambda v: v.__name__,
    )
    def test_interface_is_registered(self, container, interface):
        assert container.is_registered(interface)

    @pytest.fixture
    def container_with_temp_inventory(self, container, tmp_path):
        """Point the inventory DB at a temp file, never the user's real one."""
        container.resolve(IConfigService).set(
            "incrate.inventory_db_path", str(tmp_path / "inventory.sqlite")
        )
        return container

    @pytest.mark.parametrize(
        "concrete",
        [InventoryService, IncrateDiscoveryService],
        ids=lambda v: v.__name__,
    )
    def test_concrete_registration_preserved(self, container, concrete):
        """engine/incrate_api.py resolves these by concrete class."""
        assert container.is_registered(concrete)

    def test_privacy_service_resolves_to_implementation(self, container):
        assert isinstance(container.resolve(IPrivacyService), PrivacyService)

    def test_onboarding_service_resolves_to_implementation(self, container):
        assert isinstance(container.resolve(IOnboardingService), OnboardingService)

    def test_inventory_resolves_via_both_keys(self, container_with_temp_inventory):
        container = container_with_temp_inventory
        assert isinstance(container.resolve(IInventoryService), InventoryService)
        assert isinstance(container.resolve(InventoryService), InventoryService)

    def test_discovery_resolves_via_both_keys(self, container_with_temp_inventory):
        container = container_with_temp_inventory
        assert isinstance(
            container.resolve(IIncrateDiscoveryService), IncrateDiscoveryService
        )
        assert isinstance(
            container.resolve(IncrateDiscoveryService), IncrateDiscoveryService
        )
