from __future__ import annotations

import httpx

from app.core.config import settings
from app.models.schemas import Classification, FraudAnalysis, TransactionInput


class ExplanationAgent:
    async def explain(
        self,
        tx: TransactionInput,
        risk_score: int,
        classification: Classification,
        confidence_level: float,
        signals: list[str],
    ) -> str:
        if settings.gemini_api_key:
            explanation = await self._gemini_explanation(
                tx, risk_score, classification, confidence_level, signals
            )
            if explanation:
                return explanation
        return self._fallback_explanation(tx, risk_score, classification, confidence_level, signals)

    async def _gemini_explanation(
        self,
        tx: TransactionInput,
        risk_score: int,
        classification: Classification,
        confidence_level: float,
        signals: list[str],
    ) -> str | None:
        prompt = (
            "You are an AI blockchain security analyst. Explain the transaction risk in "
            "plain, concise operational language for a fintech security dashboard. "
            f"Transaction hash: {tx.txHash}. From: {tx.from_address}. To: {tx.to_address}. "
            f"Amount: {tx.amount}. Risk score: {risk_score}/100. "
            f"Classification: {classification.value}. Confidence: {confidence_level}. "
            f"Signals: {', '.join(signals)}. Avoid unsupported certainty."
        )
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            return None

    def _fallback_explanation(
        self,
        tx: TransactionInput,
        risk_score: int,
        classification: Classification,
        confidence_level: float,
        signals: list[str],
    ) -> str:
        primary = signals[0] if signals else "baseline wallet and transfer features"
        if classification == Classification.fraud:
            posture = "High-risk behavior was detected"
        elif classification == Classification.suspicious:
            posture = "The transaction deserves analyst review"
        else:
            posture = "No critical fraud pattern was detected"
        return (
            f"{posture}. The model assigned {risk_score}/100 risk with "
            f"{confidence_level:.0%} confidence, driven primarily by {primary}. "
            f"Observed route: {tx.from_address[:10]}... -> {tx.to_address[:10]}..."
        )

    async def explain_wallet(
        self,
        address: str,
        reputation: int,
        classification: Classification,
        analyses: list[FraudAnalysis],
    ) -> str:
        if settings.gemini_api_key:
            explanation = await self._gemini_wallet_explanation(
                address, reputation, classification, analyses
            )
            if explanation:
                return explanation
        return self._fallback_wallet_explanation(reputation, len(analyses))

    async def _gemini_wallet_explanation(
        self,
        address: str,
        reputation: int,
        classification: Classification,
        analyses: list[FraudAnalysis],
    ) -> str | None:
        tx_summaries = []
        for tx in analyses[:5]:
            tx_summaries.append(f"To {tx.to_address[:8]}... Amount: {tx.amount} ({tx.classification.value})")
        
        prompt = (
            "You are an AI blockchain security analyst providing a wallet reputation summary. "
            f"Wallet: {address}. Reputation Score: {reputation}/100. "
            f"Classification: {classification.value}. "
            f"Analyzed {len(analyses)} recent transactions. "
            "Write a concise, professional 2-3 sentence paragraph explaining the risk level of this wallet "
            "based on the score and recent activity. Do not include introductory text, just the summary."
        )
        if tx_summaries:
            prompt += f" Recent activity context: {'; '.join(tx_summaries)}."

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            return None

    def _fallback_wallet_explanation(self, reputation: int, tx_count: int) -> str:
        if reputation >= 75:
            posture = "This wallet exhibits high-risk behavior"
        elif reputation >= 45:
            posture = "This wallet shows suspicious activity"
        else:
            posture = "This wallet appears safe"
            
        return (
            f"{posture}. Wallet reputation is {reputation}/100 based on "
            f"{tx_count} stored transactions and recent counterparty behavior."
        )


explanation_agent = ExplanationAgent()
