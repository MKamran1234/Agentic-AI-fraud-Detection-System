from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Classification(StrEnum):
    safe = "SAFE"
    suspicious = "SUSPICIOUS"
    fraud = "FRAUD"


class TransactionInput(BaseModel):
    txHash: str | None = None
    from_address: str = Field(..., min_length=8)
    to_address: str = Field(..., min_length=8)
    amount: float = Field(..., ge=0)
    gas_price: float | None = Field(default=None, ge=0)
    gas_used: float | None = Field(default=None, ge=0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    network: str = "ethereum"
    metadata: dict[str, Any] = Field(default_factory=dict)


class FraudAnalysis(BaseModel):
    txHash: str
    from_address: str
    to_address: str
    amount: float
    timestamp: datetime
    network: str = "ethereum"
    risk_score: int = Field(..., ge=0, le=100)
    classification: Classification
    explanation: str
    confidence_level: float = Field(..., ge=0, le=1)
    signals: list[str] = Field(default_factory=list)
    model_output: dict[str, Any] = Field(default_factory=dict)


class WalletReport(BaseModel):
    wallet_address: str
    network: str = "ethereum"
    reputation_score: int = Field(..., ge=0, le=100)
    classification: Classification
    explanation: str
    confidence_level: float = Field(..., ge=0, le=1)
    fraud_history: list[FraudAnalysis] = Field(default_factory=list)
    linked_wallets: list[str] = Field(default_factory=list)
    last_seen: datetime | None = None
    data_source: str = "unknown"
    fetch_status: str = "unknown"


class TransactionDocument(BaseModel):
    txHash: str
    from_address: str
    to_address: str
    amount: float
    timestamp: datetime
    risk_score: int
    status: Classification
    network: str = "ethereum"
    explanation: str
    confidence_level: float
    signals: list[str] = Field(default_factory=list)


class LogDocument(BaseModel):
    event_type: str
    model_output: dict[str, Any]
    explanation: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
