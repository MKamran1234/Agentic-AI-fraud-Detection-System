from __future__ import annotations

from uuid import uuid4

from app.agents.explanation import explanation_agent
from app.agents.fraud_detection import fraud_detection_agent
from app.agents.wallet_reputation import wallet_reputation_agent
from app.db.repositories import log_repo, transaction_repo
from app.models.schemas import FraudAnalysis, TransactionInput


class AnalysisOrchestrator:
    async def analyze_transaction(self, tx: TransactionInput) -> FraudAnalysis:
        if not tx.txHash:
            tx.txHash = f"sim-{uuid4().hex}"
        tx.from_address = tx.from_address.lower()
        tx.to_address = tx.to_address.lower()

        detection = await fraud_detection_agent.analyze(tx)
        explanation = await explanation_agent.explain(
            tx,
            detection.risk_score,
            detection.classification,
            detection.confidence_level,
            detection.signals,
        )
        analysis = FraudAnalysis(
            txHash=tx.txHash,
            from_address=tx.from_address,
            to_address=tx.to_address,
            amount=tx.amount,
            timestamp=tx.timestamp,
            network=tx.network,
            risk_score=detection.risk_score,
            classification=detection.classification,
            explanation=explanation,
            confidence_level=detection.confidence_level,
            signals=detection.signals,
            model_output=detection.model_output,
        )
        await transaction_repo.upsert_analysis(analysis)
        await wallet_reputation_agent.update_from_analysis(analysis)
        await log_repo.write("transaction_analyzed", analysis.model_output, explanation)
        return analysis


analysis_orchestrator = AnalysisOrchestrator()
