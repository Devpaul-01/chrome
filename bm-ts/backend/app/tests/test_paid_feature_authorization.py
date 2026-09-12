"""Architecture tests for paid HTTP feature authorization.

The production security boundary is the ``paid_features_router`` parent
``APIRouter`` in ``app.main``.  It owns one
``Depends(require_active_entitlement)`` dependency that automatically applies
to every HTTP path operation mounted beneath it.

These tests intentionally do *not* walk ``app.routes``.  FastAPI 0.137+
represents included routers as a tree and explicitly treats ``router.routes``
as an internal implementation detail.  The tests instead validate the public
router-level dependency policy and the public OpenAPI surface.
"""

from __future__ import annotations

from app.api.deps import require_active_entitlement
from app.main import (
    PAID_HTTP_ROUTER_MODULES,
    PAID_HTTP_ROUTER_SPECS,
    app,
    paid_features_router,
)


EXPECTED_PAID_HTTP_ROUTER_MODULES = frozenset(
    {
        "app.api.routers.birthday_configs",
        "app.api.routers.contacts",
        "app.api.routers.dashboard",
        "app.api.routers.images",
        "app.api.routers.message_groups",
        "app.api.routers.message_templates",
        "app.api.routers.messages",
        "app.api.routers.posts",
        "app.api.routers.rate_limits",
        "app.api.routers.smtp",
        "app.api.routers.templates",
    }
)

EXPECTED_PAID_TAGS = frozenset(
    {
        "birthday-configs",
        "contacts",
        "dashboard",
        "images",
        "message-groups",
        "message-templates",
        "messages",
        "posts",
        "rate-limits",
        "smtp",
        "templates",
    }
)

CONTROL_PREFIXES = (
    "/auth",
    "/subscription",
    "/stripe",
    "/api/payments",
    "/health",
)


def _router_dependency_calls() -> set[object]:
    """Return direct dependencies declared on the paid parent router."""
    return {
        dependency.dependency
        for dependency in paid_features_router.dependencies
        if getattr(dependency, "dependency", None) is not None
    }


def _openapi_operations() -> list[tuple[str, str, dict]]:
    """Return (path, method, operation) triples from the public OpenAPI schema."""
    operations: list[tuple[str, str, dict]] = []
    schema = app.openapi()
    for path, path_item in schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if method.lower() not in {
                "get",
                "post",
                "put",
                "patch",
                "delete",
                "options",
                "head",
                "trace",
            }:
                continue
            if isinstance(operation, dict):
                operations.append((path, method.upper(), operation))
    return operations


def test_paid_parent_router_enforces_active_entitlement() -> None:
    """The paid boundary itself must require provider-neutral paid access."""
    assert require_active_entitlement in _router_dependency_calls(), (
        "paid_features_router must declare Depends(require_active_entitlement). "
        "Without this dependency, every paid feature becomes accessible to any "
        "authenticated user regardless of subscription state."
    )


def test_paid_router_registry_is_complete_and_unique() -> None:
    """Keep the explicit paid-feature registry complete and duplicate-free."""
    module_names = [module_name for module_name, _router, _options in PAID_HTTP_ROUTER_SPECS]

    assert len(module_names) == len(set(module_names)), (
        "PAID_HTTP_ROUTER_SPECS contains duplicate router modules: "
        f"{module_names}"
    )
    assert PAID_HTTP_ROUTER_MODULES == EXPECTED_PAID_HTTP_ROUTER_MODULES, (
        "The paid HTTP router registry changed. Review the change as a security "
        "decision and update this test intentionally. "
        f"expected={sorted(EXPECTED_PAID_HTTP_ROUTER_MODULES)} "
        f"actual={sorted(PAID_HTTP_ROUTER_MODULES)}"
    )


def test_every_expected_paid_feature_is_exposed_in_openapi() -> None:
    """Catch paid routers that were configured but never reached the public API."""
    observed_tags = {
        tag
        for _path, _method, operation in _openapi_operations()
        for tag in operation.get("tags", [])
    }
    missing_tags = sorted(EXPECTED_PAID_TAGS - observed_tags)
    assert missing_tags == [], (
        "Expected paid feature tags were not present in the generated OpenAPI "
        f"schema: {missing_tags}"
    )


def test_control_plane_remains_outside_paid_feature_surface() -> None:
    """Users must still be able to sign in, renew, and receive billing callbacks."""
    paths = {path for path, _method, _operation in _openapi_operations()}
    missing_prefixes = [
        prefix
        for prefix in CONTROL_PREFIXES
        if not any(path == prefix or path.startswith(prefix + "/") for path in paths)
    ]
    assert missing_prefixes == [], (
        "Expected unpaid control-plane API prefixes were not registered: "
        f"{missing_prefixes}"
    )


def test_paid_and_control_surfaces_do_not_overlap_by_prefix() -> None:
    """A control-plane endpoint must never accidentally live under a paid prefix."""
    paid_operations = [
        (path, method, operation)
        for path, method, operation in _openapi_operations()
        if EXPECTED_PAID_TAGS.intersection(operation.get("tags", []))
    ]

    overlaps = [
        f"{method} {path}"
        for path, method, _operation in paid_operations
        if any(path == prefix or path.startswith(prefix + "/") for prefix in CONTROL_PREFIXES)
    ]
    assert overlaps == [], (
        "Paid feature operations overlap unpaid billing/auth/control prefixes: "
        f"{overlaps}"
    )
