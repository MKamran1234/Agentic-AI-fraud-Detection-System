# Vercel serverless entry point for FastAPI backend
# This file wraps the FastAPI app with Mangum for AWS Lambda / Vercel compatibility

from mangum import Mangum
from app.main import app  # noqa: F401 — import triggers lifespan registration

handler = Mangum(app, lifespan="off")
