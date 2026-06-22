from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


def train(data_dir: Path, output: Path) -> None:
    classes_path = data_dir / "elliptic_txs_classes.csv"
    features_path = data_dir / "elliptic_txs_features.csv"
    if not classes_path.exists() or not features_path.exists():
        raise FileNotFoundError(
            "Expected elliptic_txs_classes.csv and elliptic_txs_features.csv in the data directory."
        )

    classes = pd.read_csv(classes_path)
    features = pd.read_csv(features_path, header=None)
    features = features.rename(columns={0: "txId", 1: "time_step"})
    merged = features.merge(classes, on="txId", how="inner")
    merged = merged[merged["class"].isin(["1", "2", 1, 2])].copy()
    merged["label"] = merged["class"].astype(str).map({"1": 1, "2": 0})

    feature_columns = [column for column in merged.columns if column not in {"txId", "class", "label"}]
    x_train, x_test, y_train, y_test = train_test_split(
        merged[feature_columns],
        merged["label"],
        test_size=0.2,
        random_state=42,
        stratify=merged["label"],
    )
    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=240,
                    class_weight="balanced",
                    max_depth=18,
                    n_jobs=-1,
                    random_state=42,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    report = classification_report(y_test, pipeline.predict(x_test), target_names=["licit", "illicit"])
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "feature_count": len(feature_columns)}, output)
    print(report)
    print(f"Saved Elliptic baseline model to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="backend/data/elliptic", type=Path)
    parser.add_argument("--output", default="backend/models/elliptic_baseline.joblib", type=Path)
    args = parser.parse_args()
    train(args.data_dir, args.output)
