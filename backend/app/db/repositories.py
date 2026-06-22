from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.db.mongo import mongo
from app.models.schemas import Classification, FraudAnalysis


class InMemoryStore:
    def __init__(self) -> None:
        self.transactions: dict[str, dict[str, Any]] = {}
        self.wallets: dict[str, dict[str, Any]] = {}
        self.logs: list[dict[str, Any]] = []


memory_store = InMemoryStore()


class TransactionRepository:
    async def upsert_analysis(self, analysis: FraudAnalysis) -> None:
        if mongo.available and mongo.db is not None:
            doc = analysis.model_dump()
            doc["status"] = analysis.classification.value
            await mongo.db.transactions.update_one(
                {"txHash": analysis.txHash},
                {"$set": doc},
                upsert=True,
            )
            return
        doc = analysis.model_dump(mode="json")
        doc["status"] = analysis.classification.value
        memory_store.transactions[analysis.txHash] = doc

    async def get_by_hash(self, tx_hash: str) -> dict[str, Any] | None:
        if mongo.available and mongo.db is not None:
            return await mongo.db.transactions.find_one({"txHash": tx_hash}, {"_id": 0})
        return memory_store.transactions.get(tx_hash)

    async def saved_alerts(
        self,
        limit: int = 50,
        network: str | None = None,
        classifications: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        alert_classes = classifications or [Classification.suspicious.value, Classification.fraud.value]
        query: dict[str, Any] = {
            "$or": [
                {"classification": {"$in": alert_classes}},
                {"status": {"$in": alert_classes}},
            ]
        }
        if network and network != "all":
            query["network"] = network

        if mongo.available and mongo.db is not None:
            cursor = (
                mongo.db.transactions.find(query, {"_id": 0})
                .sort("timestamp", -1)
                .limit(limit)
            )
            return [doc async for doc in cursor]

        docs = [
            doc
            for doc in memory_store.transactions.values()
            if (doc.get("classification") in alert_classes or doc.get("status") in alert_classes)
        ]
        if network and network != "all":
            docs = [doc for doc in docs if doc.get("network") == network]
        return sorted(docs, key=lambda item: item.get("timestamp", ""), reverse=True)[:limit]

    async def recent_for_wallet(
        self, address: str, limit: int = 25, network: str | None = None
    ) -> list[dict[str, Any]]:
        address = address.lower()
        if mongo.available and mongo.db is not None:
            query: dict[str, Any] = {
                "$or": [
                    {"from_address": address},
                    {"to_address": address},
                ]
            }
            if network:
                query["network"] = network
            cursor = (
                mongo.db.transactions.find(
                    query,
                    {"_id": 0},
                )
                .sort("timestamp", -1)
                .limit(limit)
            )
            return [doc async for doc in cursor]
        docs = [
            doc
            for doc in memory_store.transactions.values()
            if doc.get("from_address", "").lower() == address
            or doc.get("to_address", "").lower() == address
        ]
        if network:
            docs = [doc for doc in docs if doc.get("network") == network]
        return sorted(docs, key=lambda item: item.get("timestamp", ""), reverse=True)[:limit]


class WalletRepository:
    async def update_wallet(
        self,
        wallet_address: str,
        reputation_score: int,
        classification: Classification,
        tx_hash: str,
        network: str = "ethereum",
    ) -> None:
        wallet_address = wallet_address.lower()
        wallet_key = f"{network}:{wallet_address}"
        update = {
            "wallet_address": wallet_address,
            "wallet_key": wallet_key,
            "network": network,
            "reputation_score": reputation_score,
            "classification": classification.value,
            "last_seen": datetime.now(UTC),
        }
        if mongo.available and mongo.db is not None:
            await mongo.db.wallets.update_one(
                {"wallet_key": wallet_key},
                {
                    "$set": update,
                    "$addToSet": {"fraud_history": tx_hash},
                },
                upsert=True,
            )
            return
        wallet = memory_store.wallets.setdefault(
            wallet_key,
            {"wallet_address": wallet_address, "wallet_key": wallet_key, "network": network, "fraud_history": []},
        )
        wallet.update(update)
        if tx_hash not in wallet["fraud_history"]:
            wallet["fraud_history"].append(tx_hash)

    async def get_wallet(self, wallet_address: str, network: str = "ethereum") -> dict[str, Any] | None:
        wallet_address = wallet_address.lower()
        wallet_key = f"{network}:{wallet_address}"
        if mongo.available and mongo.db is not None:
            return await mongo.db.wallets.find_one({"wallet_key": wallet_key}, {"_id": 0})
        return memory_store.wallets.get(wallet_key)


class LogRepository:
    async def write(self, event_type: str, model_output: dict[str, Any], explanation: str) -> None:
        doc = {
            "event_type": event_type,
            "model_output": model_output,
            "explanation": explanation,
            "timestamp": datetime.now(UTC),
        }
        if mongo.available and mongo.db is not None:
            await mongo.db.logs.insert_one(doc)
            return
        memory_store.logs.append(doc)


transaction_repo = TransactionRepository()
wallet_repo = WalletRepository()
log_repo = LogRepository()
