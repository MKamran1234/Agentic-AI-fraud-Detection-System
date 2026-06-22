from __future__ import annotations

from pathlib import Path
from typing import Any


MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "elliptic_baseline.joblib"


class EllipticBaselineModel:
    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.model_path = model_path
        self.pipeline: Any | None = None
        self.feature_count: int | None = None
        self.load()

    def load(self) -> None:
        if not self.model_path.exists():
            return
        try:
            import joblib

            artifact = joblib.load(self.model_path)
            self.pipeline = artifact["pipeline"]
            self.feature_count = artifact["feature_count"]
        except Exception:
            self.pipeline = None
            self.feature_count = None

    def predict_graph_prior(self, runtime_features: list[float]) -> int | None:
        if self.pipeline is None or self.feature_count is None:
            return None
        try:
            import numpy as np
        except Exception:
            return None
        vector = np.zeros((1, self.feature_count), dtype=float)
        for index, value in enumerate(runtime_features[: self.feature_count]):
            vector[0, index] = value
        probability = self.pipeline.predict_proba(vector)[0][1]
        return int(probability * 100)


elliptic_baseline = EllipticBaselineModel()
