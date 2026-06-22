from __future__ import annotations

from app.db.repositories import transaction_repo, wallet_repo
from app.models.schemas import Classification, FraudAnalysis, WalletReport
from app.agents.explanation import explanation_agent


class WalletReputationAgent:
    async def update_from_analysis(self, analysis: FraudAnalysis) -> None:
        from_score = self._blend_wallet_score(analysis.risk_score, outgoing=True)
        to_score = self._blend_wallet_score(analysis.risk_score, outgoing=False)
        await wallet_repo.update_wallet(
            analysis.from_address, from_score, analysis.classification, analysis.txHash, analysis.network
        )
        await wallet_repo.update_wallet(
            analysis.to_address, to_score, analysis.classification, analysis.txHash, analysis.network
        )

    async def report(self, address: str, network: str = "ethereum") -> WalletReport:
        wallet = await wallet_repo.get_wallet(address, network)
        history_docs = await transaction_repo.recent_for_wallet(address, network=network)
        analyses = [self._doc_to_analysis(doc) for doc in history_docs]
        has_evidence = bool(wallet or analyses)
        if wallet:
            reputation = int(wallet.get("reputation_score", 20))
        elif analyses:
            reputation = min(100, int(sum(item.risk_score for item in analyses) / len(analyses)))
        else:
            reputation = 0

        classification = self._classification(reputation)
        linked = sorted(
            {
                item.to_address.lower()
                if item.from_address.lower() == address.lower()
                else item.from_address.lower()
                for item in analyses
            }
        )[:10]
        if has_evidence:
            explanation = await explanation_agent.explain_wallet(
                address, reputation, classification, analyses
            )
            confidence = min(0.95, 0.58 + len(analyses) * 0.03)
        else:
            explanation = (
                "No wallet reputation has been computed because no stored transactions "
                "or provider history were found for this address."
            )
            confidence = 0.2
        return WalletReport(
            wallet_address=address.lower(),
            network=network,
            reputation_score=reputation,
            classification=classification,
            explanation=explanation,
            confidence_level=round(confidence, 2),
            fraud_history=analyses[:10],
            linked_wallets=linked,
            last_seen=wallet.get("last_seen") if wallet else None,
            data_source="stored",
        )

    def _blend_wallet_score(self, tx_score: int, outgoing: bool) -> int:
        modifier = 1.0 if outgoing else 0.72
        return int(min(100, max(0, tx_score * modifier)))

    def _classification(self, score: int) -> Classification:
        if score >= 75:
            return Classification.fraud
        if score >= 45:
            return Classification.suspicious
        return Classification.safe

    def _doc_to_analysis(self, doc: dict) -> FraudAnalysis:
        return FraudAnalysis(
            txHash=doc["txHash"],
            from_address=doc["from_address"],
            to_address=doc["to_address"],
            amount=float(doc["amount"]),
            timestamp=doc["timestamp"],
            network=doc.get("network", "ethereum"),
            risk_score=int(doc["risk_score"]),
            classification=Classification(doc.get("classification") or doc.get("status")),
            explanation=doc["explanation"],
            confidence_level=float(doc["confidence_level"]),
            signals=doc.get("signals", []),
            model_output=doc.get("model_output", {}),
        )


wallet_reputation_agent = WalletReputationAgent()
