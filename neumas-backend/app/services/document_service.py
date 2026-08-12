from __future__ import annotations

"""
Document service — creates and manages document records from scan extractions.
"""

from typing import Any
from uuid import UUID

from app.api.deps import TenantContext
from app.core.constants import CONFIDENCE_REVIEW_THRESHOLD
from app.core.logging import get_logger
from app.db.repositories.document_line_items import DocumentLineItemsRepository
from app.db.repositories.documents import DocumentsRepository

logger = get_logger(__name__)


def _to_float(value: Any) -> float | None:
    try:
        if value in {None, ""}:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class DocumentService:
    """Service for document management."""

    def __init__(self) -> None:
        self._docs_repo = DocumentsRepository()
        self._line_items_repo = DocumentLineItemsRepository()

    async def create_from_scan(
        self,
        tenant: TenantContext,
        scan_id: UUID,
        document_type: str,
        raw_extraction: dict[str, Any],
        extracted_items: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """
        Create a document and its line items from a completed scan extraction.

        Determines overall confidence and sets review_needed if any item
        has confidence below the threshold.
        """
        # Compute overall confidence as the mean of item confidences
        confidences = [
            float(item["confidence"])
            for item in extracted_items
            if item.get("confidence") is not None
        ]
        overall_confidence = sum(confidences) / len(confidences) if confidences else None

        # Flag document for review if confidence is below threshold
        review_needed = any(
            float(item.get("confidence", 1.0)) < CONFIDENCE_REVIEW_THRESHOLD
            for item in extracted_items
        ) or (overall_confidence is not None and overall_confidence < CONFIDENCE_REVIEW_THRESHOLD)

        receipt_metadata = raw_extraction.get("receipt_metadata") if isinstance(raw_extraction.get("receipt_metadata"), dict) else {}
        raw_vendor = (
            raw_extraction.get("vendor_name")
            or raw_extraction.get("vendor")
            or receipt_metadata.get("vendor_name")
        )
        document_date = (
            raw_extraction.get("receipt_date")
            or raw_extraction.get("document_date")
            or receipt_metadata.get("receipt_date")
        )
        currency = (
            raw_extraction.get("currency")
            or receipt_metadata.get("currency")
        )
        total_amount = (
            _to_float(raw_extraction.get("receipt_total"))
            or _to_float(raw_extraction.get("total_amount"))
            or _to_float(raw_extraction.get("total"))
            or _to_float(receipt_metadata.get("receipt_total"))
        )
        subtotal_amount = (
            _to_float(raw_extraction.get("subtotal"))
            or _to_float(receipt_metadata.get("subtotal"))
        )
        tax_amount = (
            _to_float(raw_extraction.get("tax"))
            or _to_float(receipt_metadata.get("tax"))
        )
        document_number = (
            _to_text(raw_extraction.get("invoice_number"))
            or _to_text(raw_extraction.get("receipt_number"))
            or _to_text(raw_extraction.get("document_number"))
            or _to_text(receipt_metadata.get("invoice_number"))
        )

        document = await self._docs_repo.create(
            tenant=tenant,
            scan_id=scan_id,
            document_type=document_type,
            raw_extraction=raw_extraction,
            raw_vendor_name=raw_vendor,
            total_amount=total_amount,
            currency=_to_text(currency),
            document_date=_to_text(document_date),
            subtotal_amount=subtotal_amount,
            tax_amount=tax_amount,
            document_number=document_number,
            overall_confidence=overall_confidence,
            review_needed=review_needed,
            review_reason="Low extraction confidence" if review_needed else None,
        )

        if not document:
            return None

        document_id = UUID(document["id"])

        # Insert line items
        line_items_data = []
        for item in extracted_items:
            confidence = float(item.get("confidence", 1.0))
            item_review = confidence < CONFIDENCE_REVIEW_THRESHOLD
            line_items_data.append({
                "raw_name": item.get("name") or item.get("item_name", ""),
                "raw_quantity": item.get("quantity"),
                "raw_unit": item.get("unit"),
                "raw_price": item.get("unit_price") or item.get("price"),
                "raw_total": item.get("total_price") or item.get("total"),
                "category_name": item.get("category"),
                "brand_name": item.get("brand"),
                "pack_size": item.get("pack_size"),
                "supplier_sku": item.get("supplier_sku") or item.get("sku"),
                "confidence": confidence,
                "review_needed": item_review,
                "review_reason": "Low confidence" if item_review else None,
            })

        if line_items_data:
            await self._line_items_repo.create_many(tenant, document_id, line_items_data)

        document["line_items_count"] = len(line_items_data)
        document["review_needed"] = review_needed

        logger.info(
            "Document created from scan",
            document_id=str(document_id),
            scan_id=str(scan_id),
            line_items=len(line_items_data),
            review_needed=review_needed,
        )
        return document

    async def get_with_line_items(
        self,
        tenant: TenantContext,
        document_id: UUID,
    ) -> dict[str, Any] | None:
        """Get document with all its line items."""
        document = await self._docs_repo.get_by_id(tenant, document_id)
        if not document:
            return None
        document["line_items"] = await self._line_items_repo.list_for_document(tenant, document_id)
        return document

    async def list_documents(
        self,
        tenant: TenantContext,
        status: str | None = None,
        review_needed: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List documents for tenant with optional filters."""
        return await self._docs_repo.list(
            tenant, status=status, review_needed=review_needed, limit=limit, offset=offset
        )

    async def get_review_queue(self, tenant: TenantContext) -> list[dict[str, Any]]:
        """Return documents needing human review."""
        return await self._docs_repo.get_review_queue(tenant)
