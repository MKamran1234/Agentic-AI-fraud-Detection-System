from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

from cachetools import TTLCache

from app.core.config import settings
from app.ml.elliptic_baseline import elliptic_baseline
from app.models.schemas import Classification, TransactionInput


@dataclass
class DetectionResult:
    risk_score: int
    classification: Classification
    confidence_level: float
    signals: list[str]
    model_output: dict


class FraudDetectionAgent:
    def __init__(self) -> None:
        self.cache: TTLCache[str, DetectionResult] = TTLCache(maxsize=4096, ttl=600)
        self._scam_pipeline = None
        self._fraud_model_ready = False
        if settings.enable_hf_models:
            self._load_optional_models()

    def _load_optional_models(self) -> None:
        try:
            from transformers import pipeline

            self._scam_pipeline = pipeline(
                "text-classification",
                model=settings.hf_scam_model,
                truncation=True,
            )
            self._fraud_model_ready = True
        except Exception:
            self._scam_pipeline = None
            self._fraud_model_ready = False

    async def analyze(self, tx: TransactionInput) -> DetectionResult:
        fingerprint = self._fingerprint(tx)
        if fingerprint in self.cache:
            return self.cache[fingerprint]

        score, signals = self._rule_score(tx)
        graph_prior = elliptic_baseline.predict_graph_prior(self._runtime_graph_features(tx))
        if graph_prior is not None:
            score = max(score, graph_prior)
            signals.append("Elliptic Bitcoin graph baseline raised the transaction prior")
        scam_score = self._run_scambert(tx)
        if scam_score:
            score = max(score, scam_score)
            signals.append("SCAMBERT phishing language model indicated elevated scam semantics")

        score = int(max(0, min(100, score)))
        classification = self._classify(score)
        confidence = self._confidence(score, len(signals))
        model_output = {
            "fraud_model": settings.hf_fraud_model,
            "fraud_model_status": "configured" if self._fraud_model_ready else "rule_fallback",
            "elliptic_baseline": "loaded" if graph_prior is not None else "not_loaded",
            "scam_model": settings.hf_scam_model,
            "scam_model_status": "loaded" if self._scam_pipeline else "rule_fallback",
            "transaction_source": str(tx.metadata.get("data_source", "unknown")),
            "score_components": signals,
        }
        result = DetectionResult(score, classification, confidence, signals, model_output)
        self.cache[fingerprint] = result
        return result

    def _fingerprint(self, tx: TransactionInput) -> str:
        raw = "|".join(
            [
                tx.txHash or "",
                tx.from_address.lower(),
                tx.to_address.lower(),
                str(tx.amount),
                str(tx.gas_price or 0),
                str(tx.gas_used or 0),
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _rule_score(self, tx: TransactionInput) -> tuple[float, list[str]]:
        signals: list[str] = []
        score = 10.0

        if tx.amount == 0 and (tx.gas_price or 0) > 35:
            score += 22
            signals.append("zero-value transaction with unusually high gas activity")
        if tx.amount > 250:
            score += 28
            signals.append("large transfer amount relative to retail wallet baseline")
        elif tx.amount > 50:
            score += 15
            signals.append("elevated transfer amount")

        gas_price = tx.gas_price or 0
        gas_used = tx.gas_used or 0
        if gas_price > 80:
            score += 14
            signals.append("gas price spike consistent with bot or priority-drain behavior")
        if gas_used > 350000:
            score += 12
            signals.append("complex contract interaction with high execution footprint")

        if tx.from_address.lower() == tx.to_address.lower():
            score += 18
            signals.append("self-transfer pattern often seen in layering behavior")

        metadata = tx.metadata or {}
        if metadata.get("is_new_wallet"):
            score += 12
            signals.append("new wallet with limited reputation history")
        if metadata.get("rapid_sequence_count", 0) >= 5:
            score += 18
            signals.append("rapid repeated transfers observed in a short interval")
        if metadata.get("known_risky_counterparty"):
            score += 30
            signals.append("counterparty has prior high-risk interactions")

        hash_bias = int(hashlib.sha256((tx.txHash or tx.from_address).encode()).hexdigest()[:2], 16)
        score += math.floor((hash_bias / 255) * 10)

        if not signals:
            signals.append("no severe anomaly found; baseline graph-risk prior applied")
        return score, signals

    def _runtime_graph_features(self, tx: TransactionInput) -> list[float]:
        metadata = tx.metadata or {}
        return [
            tx.amount,
            tx.gas_price or 0,
            tx.gas_used or 0,
            float(metadata.get("rapid_sequence_count", 0)),
            1.0 if metadata.get("is_new_wallet") else 0.0,
            1.0 if metadata.get("known_risky_counterparty") else 0.0,
        ]

    def _run_scambert(self, tx: TransactionInput) -> int | None:
        if not self._scam_pipeline:
            return None
        text = " ".join(
            [
                str(tx.metadata.get("memo", "")),
                str(tx.metadata.get("contract_label", "")),
                tx.from_address,
                tx.to_address,
            ]
        ).strip()
        if not text:
            return None
        try:
            output = self._scam_pipeline(text[:512])[0]
            confidence = float(output.get("score", 0))
            label = str(output.get("label", "")).lower()
            if "scam" in label or "phish" in label or "fraud" in label:
                return int(55 + confidence * 40)
        except Exception:
            return None
        return None

    def _classify(self, score: int) -> Classification:
        if score >= 75:
            return Classification.fraud
        if score >= 45:
            return Classification.suspicious
        return Classification.safe

    def _confidence(self, score: int, signal_count: int) -> float:
        distance = abs(score - 50) / 50
        signal_bonus = min(signal_count * 0.04, 0.2)
        return round(min(0.98, 0.62 + distance * 0.22 + signal_bonus), 2)


fraud_detection_agent = FraudDetectionAgent()
