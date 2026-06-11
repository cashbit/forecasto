"""Tests for collection document projection, sort and aggregation."""

from __future__ import annotations

import pytest
import pytest_asyncio

from forecasto.models.collection import Collection, CollectionDocument
from forecasto.schemas.collection import (
    DocumentAggregate,
    DocumentAggregateQuery,
    DocumentFilter,
    DocumentOrderBy,
    DocumentQuery,
)
from forecasto.services.collection_service import CollectionService

INVOICES = [
    {"cliente": "SIAD", "anno": 2025, "imponibile": 100.0, "iva": 22.0, "totale": 122.0, "numero": "1"},
    {"cliente": "SIAD", "anno": 2025, "imponibile": 200.0, "iva": 44.0, "totale": 244.0, "numero": "2"},
    {"cliente": "ACME", "anno": 2025, "imponibile": 50.0, "iva": 11.0, "totale": 61.0, "numero": "3"},
    {"cliente": "ACME", "anno": 2024, "imponibile": 999.0, "iva": 0.0, "totale": 999.0, "numero": "4"},
]


@pytest_asyncio.fixture
async def collection_with_docs(db_session, test_workspace):
    coll = Collection(workspace_id=test_workspace.id, name="Fatture", slug="fatture")
    db_session.add(coll)
    await db_session.flush()
    for inv in INVOICES:
        db_session.add(
            CollectionDocument(
                workspace_id=test_workspace.id,
                collection_id=coll.id,
                status="active",
                data=inv,
            )
        )
    await db_session.commit()
    return test_workspace.id, coll.id


@pytest.mark.asyncio
async def test_projection(db_session, collection_with_docs):
    ws_id, coll_id = collection_with_docs
    svc = CollectionService(db_session)
    docs, total = await svc.query_documents(
        ws_id, coll_id, DocumentQuery(filters=[], limit=200)
    )
    assert total == 4
    # Projection happens in the router; the service returns full data.
    from forecasto.services.collection_service import project_data

    projected = project_data(docs[0].data, ["$.cliente", "$.totale"])
    assert set(projected.keys()) == {"cliente", "totale"}


@pytest.mark.asyncio
async def test_order_by(db_session, collection_with_docs):
    ws_id, coll_id = collection_with_docs
    svc = CollectionService(db_session)
    docs, _ = await svc.query_documents(
        ws_id,
        coll_id,
        DocumentQuery(order_by=[DocumentOrderBy(path="$.totale", direction="desc")], limit=200),
    )
    totals = [d.data["totale"] for d in docs]
    assert totals == sorted(totals, reverse=True)
    assert totals[0] == 999.0


@pytest.mark.asyncio
async def test_aggregate_sum_count(db_session, collection_with_docs):
    ws_id, coll_id = collection_with_docs
    svc = CollectionService(db_session)
    results, total_groups = await svc.aggregate_documents(
        ws_id,
        coll_id,
        DocumentAggregateQuery(
            filters=[DocumentFilter(path="$.anno", op="eq", value=2025)],
            group_by=["$.cliente"],
            aggregates=[
                DocumentAggregate(field="$.totale", fn="sum", **{"as": "fatturato"}),
                DocumentAggregate(field="$.numero", fn="count", **{"as": "n_fatture"}),
            ],
            order_by=[DocumentOrderBy(path="$.fatturato", direction="desc")],
        ),
    )
    assert total_groups == 2  # SIAD + ACME in 2025
    assert results[0]["$.cliente"] == "SIAD"
    assert results[0]["fatturato"] == pytest.approx(366.0)
    assert results[0]["n_fatture"] == 2
    assert results[1]["$.cliente"] == "ACME"
    assert results[1]["fatturato"] == pytest.approx(61.0)
