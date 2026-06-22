from __future__ import annotations

import asyncio
from contextlib import suppress

from fastapi import WebSocket

from app.agents.orchestrator import analysis_orchestrator
from app.core.config import settings
from app.services.blockchain import blockchain_client


class StreamManager:
    def __init__(self) -> None:
        self.connections: dict[WebSocket, str] = {}
        self._task: asyncio.Task | None = None
        self._latest: dict[str, list[dict]] = {}

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    async def connect(self, websocket: WebSocket, network: str = "ethereum") -> None:
        await websocket.accept()
        self.connections[websocket] = network
        for item in self._latest.get(network, [])[-12:]:
            await websocket.send_json(item)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.pop(websocket, None)

    async def broadcast(self, payload: dict, network: str | None = None) -> None:
        dead: list[WebSocket] = []
        for connection, connection_network in self.connections.items():
            if network is not None and connection_network != network:
                continue
            try:
                await connection.send_json(payload)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)

    async def _poll_loop(self) -> None:
        while True:
            try:
                active_networks = set(self.connections.values()) or {settings.blockchain_network}
                for network in active_networks:
                    transactions = await blockchain_client.fetch_latest_transactions(limit=4, network=network)
                    if not transactions and not settings.allow_mock_fallback and not settings.use_mock_stream:
                        await self.broadcast(
                            {
                                "event": "stream_warning",
                                "network": network,
                                "message": f"No real-time transactions received for {network}; mock fallback is disabled.",
                            },
                            network,
                        )
                    for tx in transactions:
                        analysis = await analysis_orchestrator.analyze_transaction(tx)
                        payload = analysis.model_dump(mode="json")
                        latest = self._latest.setdefault(network, [])
                        latest.append(payload)
                        self._latest[network] = latest[-50:]
                        await self.broadcast(payload, network)
            except Exception as exc:
                await self.broadcast(
                        {
                            "event": "stream_error",
                            "message": str(exc),
                        }
                    )
            await asyncio.sleep(settings.stream_poll_seconds)


stream_manager = StreamManager()
