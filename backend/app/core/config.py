from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Agentic AI Fraud Detection"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "agentic_fraud_detection"

    etherscan_api_key: str | None = None
    bscscan_api_key: str | None = None
    blockchain_network: str = "ethereum"
    blockchain_chain_id: str = "1"
    stream_poll_seconds: float = 4.0
    use_mock_stream: bool = True
    allow_mock_fallback: bool = True

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"

    enable_hf_models: bool = False
    hf_fraud_model: str = "uyen1109/eth-fraud-gnn-uyenuyen-v3"
    hf_scam_model: str = "Digvijay05/SCAMBERT"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def frontend_origin_list(self) -> list[str]:
        return [item.strip() for item in self.frontend_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
