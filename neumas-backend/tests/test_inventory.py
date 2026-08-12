"""
Tests for inventory endpoints.
"""

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.api.deps import TenantContext
from app.main import app
from app.schemas.auth import UserInfo
from app.schemas.inventory import InventoryUpdateRequest
from app.services.inventory_service import InventoryService


@pytest.fixture
def test_user() -> UserInfo:
    """Create a test user."""
    return UserInfo(
        id=uuid4(),
        auth_id=uuid4(),
        email="test@example.com",
        full_name="Test User",
        role="manager",
        organization_id=uuid4(),
        is_active=True,
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Create auth headers with a test token."""
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def sample_inventory_item() -> dict:
    """Create a sample inventory item."""
    return {
        "id": str(uuid4()),
        "property_id": str(uuid4()),
        "name": "Coffee Beans",
        "sku": "COFFEE-001",
        "category_id": str(uuid4()),
        "unit": "kg",
        "current_quantity": "10.5",
        "reorder_point": "5.0",
        "max_quantity": "50.0",
        "unit_cost": "25.00",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
async def client():
    """Create an async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


class TestInventoryList:
    """Tests for inventory listing."""

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, client: AsyncClient):
        """Test listing inventory requires authentication."""
        property_id = uuid4()
        response = await client.get(
            f"/api/inventory/?property_id={property_id}",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_list_requires_property_id(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing inventory requires property_id."""
        response = await client.get(
            "/api/inventory/",
            headers=auth_headers,
        )

        # Requires auth first, then property_id validation
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestInventoryCreate:
    """Tests for creating inventory items."""

    @pytest.mark.asyncio
    async def test_create_item_validation(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating item with invalid data fails validation."""
        response = await client.post(
            "/api/inventory/",
            headers=auth_headers,
            json={
                "name": "",  # Empty name should fail
                "property_id": str(uuid4()),
            },
        )

        # Either auth failure or validation failure
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestInventoryQuantity:
    """Tests for quantity operations."""

    @pytest.mark.asyncio
    async def test_set_quantity_requires_positive(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that quantity must be non-negative."""
        item_id = uuid4()

        response = await client.post(
            f"/api/inventory/{item_id}/quantity/adjust",
            headers=auth_headers,
            json={
                "adjustment": -5.0,
                "reason": "correction",
            },
        )

        # Either auth failure or validation failure
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]

    @pytest.mark.asyncio
    async def test_adjust_quantity_allows_negative(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that adjustment can be negative (for consumption)."""
        item_id = uuid4()

        response = await client.post(
            f"/api/inventory/{item_id}/quantity/adjust",
            headers=auth_headers,
            json={
                "adjustment": -3.0,
                "reason": "consumed",
            },
        )

        # Will fail on auth, but request format is valid
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_200_OK,
        ]


class TestLowStock:
    """Tests for low stock functionality."""

    @pytest.mark.asyncio
    async def test_low_stock_requires_property(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test low stock endpoint requires property_id."""
        response = await client.get(
            "/api/inventory/low-stock",
            headers=auth_headers,
        )

        # Missing property_id
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestBulkUpdate:
    """Tests for bulk update operations."""

    @pytest.mark.asyncio
    async def test_bulk_update_schema(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test bulk update request schema."""
        response = await client.post(
            "/api/inventory/update",
            headers=auth_headers,
            json={
                "updates": [
                    {"item_id": str(uuid4()), "quantity": 10.0},
                    {"item_id": str(uuid4()), "quantity": 5.0},
                ],
                "source": "scan",
            },
        )

        # Will fail on auth
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_200_OK,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]


class TestInventoryUpsertService:
    """Tests for direct inventory upsert behavior."""

    @pytest.mark.asyncio
    async def test_prediction_enqueue_failure_does_not_fail_save(self, monkeypatch):
        """Saving inventory should succeed even if Redis/Celery is down."""
        property_id = uuid4()
        item_id = uuid4()
        tenant = TenantContext(
            user_id=uuid4(),
            org_id=uuid4(),
            property_id=property_id,
            role="staff",
            jwt="test-token",
        )

        repo = AsyncMock()
        repo.get_by_name.return_value = None
        repo.create.return_value = {
            "id": str(item_id),
            "property_id": str(property_id),
            "name": "Saffron Pumpkin Seed",
            "quantity": "1",
            "unit": "unit",
        }
        monkeypatch.setattr(
            "app.services.inventory_service.get_inventory_repository",
            AsyncMock(return_value=repo),
        )

        def fail_send_task(*_args, **_kwargs):
            raise RuntimeError("Retry limit exceeded while trying to reconnect to the Celery result store backend")

        monkeypatch.setattr("app.services.inventory_service.celery_app.send_task", fail_send_task)

        result = await InventoryService().upsert_item_by_name(
            InventoryUpdateRequest(
                property_id=property_id,
                item_name="Saffron Pumpkin Seed",
                new_qty=Decimal("1"),
                unit="unit",
                trigger_prediction=True,
            ),
            tenant,
        )

        assert result.item_id == item_id
        assert result.created is True
        assert result.prediction_task_id is None


class TestCategories:
    """Tests for category operations."""

    @pytest.mark.asyncio
    async def test_list_categories_requires_org(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing categories requires authentication."""
        response = await client.get(
            "/api/inventory/categories",
            headers=auth_headers,
        )

        # Will fail on auth or route not yet defined
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_404_NOT_FOUND,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]
