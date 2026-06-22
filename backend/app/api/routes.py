from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.agents.orchestrator import analysis_orchestrator
from app.agents.wallet_reputation import wallet_reputation_agent
from app.core.config import settings
from app.db.mongo import mongo
from app.db.repositories import transaction_repo
from app.ml.elliptic_baseline import elliptic_baseline
from app.models.schemas import FraudAnalysis, TransactionInput, WalletReport
from app.services.blockchain import blockchain_client
from app.services.stream_manager import stream_manager

router = APIRouter()


def _analysis_from_doc(doc: dict) -> FraudAnalysis:
    return FraudAnalysis(
        txHash=doc["txHash"],
        from_address=doc["from_address"],
        to_address=doc["to_address"],
        amount=float(doc["amount"]),
        timestamp=doc["timestamp"],
        network=doc.get("network", "ethereum"),
        risk_score=int(doc["risk_score"]),
        classification=doc.get("classification") or doc.get("status"),
        explanation=doc["explanation"],
        confidence_level=float(doc["confidence_level"]),
        signals=doc.get("signals", []),
        model_output=doc.get("model_output", {}),
    )


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "mongo": "connected" if mongo.available else "fallback-memory",
        "stream": "running",
        "stream_mode": (
            "mock_only"
            if settings.use_mock_stream
            else "real_with_fallback"
            if settings.allow_mock_fallback
            else "real_only"
        ),
        "elliptic_model": "loaded" if elliptic_baseline.pipeline is not None else "not_loaded",
    }


@router.get("/networks")
async def networks() -> list[dict]:
    return blockchain_client.supported_networks()


@router.post("/analyze-transaction", response_model=FraudAnalysis)
async def analyze_transaction(payload: TransactionInput) -> FraudAnalysis:
    return await analysis_orchestrator.analyze_transaction(payload)


@router.get("/wallet/{address}", response_model=WalletReport)
async def wallet(address: str, network: str = Query(default="ethereum")) -> WalletReport:
    history, fetch_status = await blockchain_client.fetch_wallet_history_with_status(address, network=network)
    for tx in history[:8]:
        await analysis_orchestrator.analyze_transaction(tx)
    report = await wallet_reputation_agent.report(address, network)
    source = history[0].metadata.get("data_source", "none") if history else "none"
    if not history:
        report.explanation = (
            f"{report.explanation} Provider status: {fetch_status}. "
            "No chain history was returned for this address in the current query."
        )
    return report.model_copy(update={"data_source": source, "fetch_status": fetch_status})


@router.get("/fraud-score/{txHash}", response_model=FraudAnalysis)
async def fraud_score(txHash: str) -> FraudAnalysis:
    doc = await transaction_repo.get_by_hash(txHash)
    if not doc:
        raise HTTPException(status_code=404, detail="Transaction has not been analyzed yet")
    return _analysis_from_doc(doc)


@router.get("/alerts", response_model=list[FraudAnalysis])
async def saved_alerts(
    network: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
) -> list[FraudAnalysis]:
    docs = await transaction_repo.saved_alerts(limit=limit, network=network)
    return [_analysis_from_doc(doc) for doc in docs]


@router.websocket("/live-stream")
async def live_stream(websocket: WebSocket, network: str = Query(default="ethereum")) -> None:
    await stream_manager.connect(websocket, network)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        stream_manager.disconnect(websocket)
