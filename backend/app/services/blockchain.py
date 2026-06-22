from __future__ import annotations

import random
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from app.core.config import settings
from app.models.schemas import TransactionInput


NETWORKS = {
    "ethereum": {
        "label": "Ethereum",
        "kind": "evm",
        "chain_id": "1",
        "symbol": "ETH",
        "source": "etherscan",
    },
    "bsc": {
        "label": "BNB Smart Chain",
        "kind": "evm",
        "chain_id": "56",
        "symbol": "BNB",
        "source": "etherscan_v2",
        "rpc_url": "https://bsc-dataseed.binance.org",
    },
    "solana": {
        "label": "Solana",
        "kind": "solana",
        "chain_id": "solana-mainnet",
        "symbol": "SOL",
        "source": "solana_rpc",
    },
}


class BlockchainClient:
    def __init__(self) -> None:
        self.network = settings.blockchain_network.lower()
        self.api_base = "https://api.etherscan.io/v2/api"
        self.solana_rpc_url = "https://api.mainnet-beta.solana.com"

    def supported_networks(self) -> list[dict]:
        return [{"id": key, **value} for key, value in NETWORKS.items()]

    def _network_config(self, network: str | None = None) -> dict:
        selected = (network or self.network or "ethereum").lower()
        return NETWORKS.get(selected, NETWORKS["ethereum"])

    def _network_id(self, network: str | None = None) -> str:
        selected = (network or self.network or "ethereum").lower()
        return selected if selected in NETWORKS else "ethereum"

    def _chain_id(self, network: str | None = None) -> str:
        config = self._network_config(network)
        if network is None and settings.blockchain_chain_id:
            return str(settings.blockchain_chain_id)
        return config["chain_id"]

    def _asset_decimals(self, network: str | None = None) -> int:
        return 9 if self._network_config(network)["kind"] == "solana" else 18

    def _asset_symbol(self, network: str | None = None) -> str:
        return self._network_config(network)["symbol"]

    async def fetch_latest_transactions(self, limit: int = 8, network: str | None = None) -> list[TransactionInput]:
        network_id = self._network_id(network)
        if settings.use_mock_stream:
            return self.mock_transactions(limit, network_id)
        config = self._network_config(network_id)
        txs = (
            await self._solana_latest(limit, network_id)
            if config["kind"] == "solana"
            else await self._etherscan_latest(limit, network_id)
        )
        if txs:
            return txs
        if settings.allow_mock_fallback:
            return self.mock_transactions(limit, network_id)
        return []

    async def fetch_wallet_history(
        self, address: str, limit: int = 25, network: str | None = None
    ) -> list[TransactionInput]:
        history, _ = await self.fetch_wallet_history_with_status(address, limit, network)
        return history

    async def fetch_wallet_history_with_status(
        self, address: str, limit: int = 25, network: str | None = None
    ) -> tuple[list[TransactionInput], str]:
        network_id = self._network_id(network)
        config = self._network_config(network_id)
        if config["kind"] == "solana":
            return await self._solana_wallet_history(address, limit, network_id)
        return await self._evm_wallet_history(address, limit, network_id)

    async def _evm_wallet_history(
        self, address: str, limit: int, network: str
    ) -> tuple[list[TransactionInput], str]:
        use_bscscan = network == "bsc" and bool(settings.bscscan_api_key)
        chain_id = self._chain_id(network)
        api_key = settings.bscscan_api_key if use_bscscan else settings.etherscan_api_key
        if not api_key:
            return [], "provider_missing_key"
        url = "https://api.bscscan.com/api" if use_bscscan else self.api_base
        params = {
            "module": "account",
            "action": "txlist",
            "address": address,
            "startblock": 0,
            "endblock": 99999999,
            "page": 1,
            "offset": limit,
            "sort": "desc",
            "apikey": api_key,
        }
        if not use_bscscan:
            params["chainid"] = chain_id
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
            if payload.get("status") == "0":
                return [], f"provider_not_ok:{payload.get('result', payload.get('message', 'unknown'))}"
            result = payload.get("result", [])
            if not isinstance(result, list):
                return [], f"provider_not_ok:{payload.get('message', 'unknown')}"
            if not result:
                return [], "provider_empty"
            provider = "bscscan" if use_bscscan else "etherscan"
            return [self._etherscan_tx_to_input(item, network, provider) for item in result[:limit]], "provider_ok"
        except Exception as exc:
            return [], f"provider_error:{type(exc).__name__}"

    async def _etherscan_latest(self, limit: int, network: str) -> list[TransactionInput]:
        api_key = settings.etherscan_api_key
        if not api_key:
            return []
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                block_response = await client.get(
                    self.api_base,
                    params={
                        "chainid": self._chain_id(network),
                        "module": "proxy",
                        "action": "eth_blockNumber",
                        "apikey": api_key,
                    },
                )
                latest_payload = block_response.json()
                latest_hex = latest_payload.get("result")
                if not latest_hex:
                    return []
                block_response = await client.get(
                    self.api_base,
                    params={
                        "chainid": self._chain_id(network),
                        "module": "proxy",
                        "action": "eth_getBlockByNumber",
                        "tag": latest_hex,
                        "boolean": "true",
                        "apikey": api_key,
                    },
                )
            block = block_response.json().get("result") or {}
            raw_txs = block.get("transactions", [])[:limit]
            parsed = [self._proxy_tx_to_input(tx, block.get("timestamp"), network, "etherscan") for tx in raw_txs]
            if parsed:
                return parsed
            return await self._evm_rpc_latest(limit, network)
        except Exception:
            return await self._evm_rpc_latest(limit, network)

    async def _evm_rpc_latest(self, limit: int, network: str) -> list[TransactionInput]:
        rpc_url = self._network_config(network).get("rpc_url")
        if not rpc_url:
            return []
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                block_number = await self._evm_rpc(client, rpc_url, "eth_blockNumber", [])
                latest_hex = block_number.get("result")
                if not latest_hex:
                    return []
                block = await self._evm_rpc(client, rpc_url, "eth_getBlockByNumber", [latest_hex, True])
            raw_txs = (block.get("result") or {}).get("transactions", [])[:limit]
            return [self._proxy_tx_to_input(tx, (block.get("result") or {}).get("timestamp"), network, "public_rpc") for tx in raw_txs]
        except Exception:
            return []

    async def _evm_rpc(self, client: httpx.AsyncClient, url: str, method: str, params: list) -> dict:
        response = await client.post(
            url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        response.raise_for_status()
        return response.json()

    async def _solana_latest(self, limit: int, network: str) -> list[TransactionInput]:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                slot_response = await self._solana_rpc(client, "getSlot", [])
                slot = slot_response.get("result")
                if slot is None:
                    return []
                for current_slot in range(int(slot), max(int(slot) - 12, 0), -1):
                    block_response = await self._solana_rpc(
                        client,
                        "getBlock",
                        [
                            current_slot,
                            {
                                "encoding": "jsonParsed",
                                "transactionDetails": "full",
                                "rewards": False,
                                "maxSupportedTransactionVersion": 0,
                            },
                        ],
                    )
                    block = block_response.get("result")
                    raw_txs = (block or {}).get("transactions") or []
                    parsed = [
                        self._solana_tx_to_input(item, network, (block or {}).get("blockTime"))
                        for item in raw_txs[:limit]
                    ]
                    parsed = [item for item in parsed if item is not None]
                    if parsed:
                        return parsed[:limit]
        except Exception:
            return []
        return []

    async def _solana_wallet_history(
        self, address: str, limit: int, network: str
    ) -> tuple[list[TransactionInput], str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                signatures_response = await self._solana_rpc(
                    client,
                    "getSignaturesForAddress",
                    [address, {"limit": min(limit, 12)}],
                )
                signatures = signatures_response.get("result") or []
                if not signatures:
                    return [], "provider_empty"
                txs: list[TransactionInput] = []
                for item in signatures:
                    signature = item.get("signature")
                    if not signature:
                        continue
                    tx_response = await self._solana_rpc(
                        client,
                        "getTransaction",
                        [
                            signature,
                            {
                                "encoding": "jsonParsed",
                                "maxSupportedTransactionVersion": 0,
                            },
                        ],
                    )
                    parsed = self._solana_tx_to_input(tx_response.get("result"), network, item.get("blockTime"))
                    if parsed:
                        txs.append(parsed)
                return txs, "provider_ok" if txs else "provider_empty"
        except Exception as exc:
            return [], f"provider_error:{type(exc).__name__}"

    async def _solana_rpc(self, client: httpx.AsyncClient, method: str, params: list) -> dict:
        response = await client.post(
            self.solana_rpc_url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        response.raise_for_status()
        return response.json()

    def _solana_tx_to_input(
        self, raw: dict | None, network: str, block_time: int | None = None
    ) -> TransactionInput | None:
        if not raw:
            return None
        transaction = raw.get("transaction") or {}
        message = transaction.get("message") or {}
        signatures = transaction.get("signatures") or []
        account_keys = message.get("accountKeys") or []
        accounts = [item.get("pubkey", item) if isinstance(item, dict) else item for item in account_keys]
        if not signatures or not accounts:
            return None
        meta = raw.get("meta") or {}
        pre = meta.get("preBalances") or []
        post = meta.get("postBalances") or []
        deltas = [after - before for before, after in zip(pre, post)]
        positive = [(idx, delta) for idx, delta in enumerate(deltas) if delta > 0 and idx < len(accounts)]
        receiver_idx, received = max(positive, key=lambda item: item[1], default=(min(1, len(accounts) - 1), 0))
        timestamp = datetime.fromtimestamp(block_time or raw.get("blockTime") or 0, tz=UTC)
        if timestamp.year == 1970:
            timestamp = datetime.now(UTC)
        return TransactionInput(
            txHash=signatures[0],
            from_address=str(accounts[0]),
            to_address=str(accounts[receiver_idx]),
            amount=max(received, 0) / 10**9,
            gas_price=0,
            gas_used=float(meta.get("fee") or 0),
            timestamp=timestamp,
            network=network,
            metadata={"data_source": "solana_rpc", "asset_symbol": "SOL"},
        )

    def _etherscan_tx_to_input(self, tx: dict, network: str, provider: str = "etherscan") -> TransactionInput:
        amount = int(tx.get("value", "0") or 0) / 10**18
        gas_price = int(tx.get("gasPrice", "0") or 0) / 10**9
        timestamp = datetime.fromtimestamp(int(tx.get("timeStamp", "0") or 0), tz=UTC)
        return TransactionInput(
            txHash=tx.get("hash"),
            from_address=tx.get("from", ""),
            to_address=tx.get("to") or "0x0000000000000000000000000000000000000000",
            amount=amount,
            gas_price=gas_price,
            gas_used=float(tx.get("gasUsed", 0) or 0),
            timestamp=timestamp,
            network=network,
            metadata={"data_source": provider, "asset_symbol": self._asset_symbol(network)},
        )

    def _proxy_tx_to_input(
        self, tx: dict, block_timestamp_hex: str | None, network: str, provider: str = "etherscan"
    ) -> TransactionInput:
        timestamp = datetime.now(UTC)
        if block_timestamp_hex:
            timestamp = datetime.fromtimestamp(int(block_timestamp_hex, 16), tz=UTC)
        amount = int(tx.get("value", "0x0"), 16) / 10**18
        gas_price = int(tx.get("gasPrice", "0x0"), 16) / 10**9
        return TransactionInput(
            txHash=tx.get("hash"),
            from_address=tx.get("from", ""),
            to_address=tx.get("to") or "0x0000000000000000000000000000000000000000",
            amount=amount,
            gas_price=gas_price,
            gas_used=float(int(tx.get("gas", "0x0"), 16)),
            timestamp=timestamp,
            network=network,
            metadata={"data_source": provider, "asset_symbol": self._asset_symbol(network)},
        )

    def mock_transactions(self, limit: int = 8, network: str | None = None) -> list[TransactionInput]:
        network_id = self._network_id(network)
        templates = [
            (0.0, 92, 420000, {"is_new_wallet": True, "rapid_sequence_count": 7}),
            (0.84, 18, 21000, {}),
            (78.5, 44, 97000, {"known_risky_counterparty": True}),
            (4.2, 22, 54000, {}),
            (310.0, 67, 380000, {"contract_label": "unknown mixer route"}),
        ]
        txs = []
        for _ in range(limit):
            amount, gas_price, gas_used, metadata = random.choice(templates)
            txs.append(
                TransactionInput(
                    txHash=f"0x{uuid4().hex}{uuid4().hex}",
                    from_address=self._mock_wallet(),
                    to_address=self._mock_wallet(),
                    amount=round(amount * random.uniform(0.85, 1.25), 6),
                    gas_price=round(gas_price * random.uniform(0.8, 1.4), 3),
                    gas_used=round(gas_used * random.uniform(0.9, 1.25), 0),
                    timestamp=datetime.now(UTC),
                    network=network_id,
                    metadata={"data_source": "mock", "asset_symbol": self._asset_symbol(network_id), **metadata},
                )
            )
        return txs

    def _mock_wallet(self) -> str:
        return f"0x{uuid4().hex[:40]}".ljust(42, "0")


blockchain_client = BlockchainClient()
