from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.mongo import mongo
from app.services.stream_manager import stream_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo.connect()
    await mongo.ensure_indexes()
    stream_manager.start()
    try:
        yield
    finally:
        await stream_manager.stop()
        await mongo.close()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Agentic blockchain fraud detection system with realtime monitoring.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
