from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings


class Mongo:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None
    available: bool = False

    async def connect(self) -> None:
        try:
            self.client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=1200)
            await self.client.admin.command("ping")
            self.db = self.client[settings.mongodb_database]
            self.available = True
        except Exception:
            self.available = False
            self.db = None

    async def close(self) -> None:
        if self.client:
            self.client.close()

    async def ensure_indexes(self) -> None:
        if not self.available or self.db is None:
            return
        await self.db.transactions.create_index("txHash", unique=True)
        await self.db.transactions.create_index([("from_address", 1), ("timestamp", -1)])
        await self.db.transactions.create_index([("to_address", 1), ("timestamp", -1)])
        await self.db.transactions.create_index("risk_score")
        await self.db.transactions.create_index([("network", 1), ("classification", 1), ("timestamp", -1)])
        await self.db.transactions.create_index([("network", 1), ("status", 1), ("timestamp", -1)])
        await self._backfill_wallet_keys()
        await self._dedupe_wallet_keys()
        await self.db.wallets.create_index(
            "wallet_key",
            unique=True,
            partialFilterExpression={"wallet_key": {"$type": "string"}},
        )
        await self.db.wallets.create_index([("wallet_address", 1), ("network", 1)])
        await self.db.logs.create_index("timestamp")

    async def _backfill_wallet_keys(self) -> None:
        if self.db is None:
            return
        cursor = self.db.wallets.find(
            {"$or": [{"wallet_key": {"$exists": False}}, {"wallet_key": None}]},
            {"wallet_address": 1, "network": 1},
        )
        async for wallet in cursor:
            address = wallet.get("wallet_address")
            if not address:
                await self.db.wallets.delete_one({"_id": wallet["_id"]})
                continue
            network = wallet.get("network") or "ethereum"
            await self.db.wallets.update_one(
                {"_id": wallet["_id"]},
                {
                    "$set": {
                        "wallet_key": f"{network}:{str(address).lower()}",
                        "wallet_address": str(address).lower(),
                        "network": network,
                    }
                },
            )

    async def _dedupe_wallet_keys(self) -> None:
        if self.db is None:
            return
        cursor = self.db.wallets.aggregate(
            [
                {"$match": {"wallet_key": {"$type": "string"}}},
                {"$group": {"_id": "$wallet_key", "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}},
            ]
        )
        async for duplicate in cursor:
            docs = await (
                self.db.wallets.find({"wallet_key": duplicate["_id"]})
                .sort("last_seen", -1)
                .to_list(length=None)
            )
            if len(docs) < 2:
                continue
            keep = docs[0]
            fraud_history = sorted(
                {
                    tx_hash
                    for doc in docs
                    for tx_hash in doc.get("fraud_history", [])
                    if tx_hash
                }
            )
            await self.db.wallets.update_one(
                {"_id": keep["_id"]},
                {"$set": {"fraud_history": fraud_history}},
            )
            await self.db.wallets.delete_many({"_id": {"$in": [doc["_id"] for doc in docs[1:]]}})


mongo = Mongo()
