"""
RecoverTrack - Model Training Script for Adherence Risk
Uses Calibrated Logistic Regression on Synthetic Post-Op Data
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import roc_auc_score, brier_score_loss, log_loss

from app.risk.generate_synthetic import save_synthetic_dataset, SYNTHETIC_CSV_PATH

MODEL_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(MODEL_DIR, "adherence_risk_model.joblib")
METRICS_PATH = os.path.join(MODEL_DIR, "metrics.json")

FEATURE_COLUMNS = [
    "miss_rate_3d",
    "miss_rate_7d",
    "longest_gap_hours",
    "avg_delay_mins",
    "evening_miss_rate",
    "weekend_miss_rate",
    "hours_since_discharge",
    "snooze_count"
]

def train_risk_model():
    # 1. Load or generate synthetic dataset
    if not os.path.exists(SYNTHETIC_CSV_PATH):
        df = save_synthetic_dataset()
    else:
        df = pd.read_csv(SYNTHETIC_CSV_PATH)

    X = df[FEATURE_COLUMNS]
    y = df["miss_next_24h"]

    # 2. Train / Held-out Test split (80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    # 3. Base pipeline: Scaler + Logistic Regression with L2 regularization
    base_estimator = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(penalty="l2", C=1.0, solver="lbfgs", random_state=42))
    ])

    # 4. Calibrated Classifier (Platt scaling via CalibratedClassifierCV)
    calibrated_clf = CalibratedClassifierCV(
        estimator=base_estimator,
        method="sigmoid",
        cv=5
    )
    calibrated_clf.fit(X_train, y_train)

    # 5. Evaluate on held-out synthetic test set
    y_pred_prob = calibrated_clf.predict_proba(X_test)[:, 1]
    auc = float(roc_auc_score(y_test, y_pred_prob))
    brier = float(brier_score_loss(y_test, y_pred_prob))
    loss = float(log_loss(y_test, y_pred_prob))

    # Calibration Curve (10 bins)
    prob_true, prob_pred = calibration_curve(y_test, y_pred_prob, n_bins=10, strategy="uniform")
    calibration_points = [
        {"predicted": float(p_pred), "empirical": float(p_true)}
        for p_pred, p_true in zip(prob_pred, prob_true)
    ]

    # Feature importances from the underlying logistic model
    # Fit base model once to inspect coefficients for interpretability
    base_estimator.fit(X_train, y_train)
    coefs = base_estimator.named_steps["classifier"].coef_[0]
    feature_importance = {
        feat: float(c) for feat, c in zip(FEATURE_COLUMNS, coefs)
    }

    metrics = {
        "dataset_type": "SYNTHETIC_SIMULATED",
        "n_samples": len(df),
        "test_samples": len(X_test),
        "roc_auc": round(auc, 4),
        "brier_score": round(brier, 4),
        "log_loss": round(loss, 4),
        "calibration_curve": calibration_points,
        "feature_coefficients": feature_importance,
        "features": FEATURE_COLUMNS
    }

    # 6. Save model and metrics to disk
    joblib.dump(calibrated_clf, MODEL_PATH)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("==================================================")
    print("RecoverTrack Adherence Risk Model Trained Successfully")
    print(f"Held-out Synthetic Test ROC-AUC: {auc:.4f}")
    print(f"Brier Score: {brier:.4f}")
    print(f"Log Loss: {loss:.4f}")
    print(f"Model saved to: {MODEL_PATH}")
    print(f"Metrics saved to: {METRICS_PATH}")
    print("==================================================")

    return calibrated_clf, metrics

if __name__ == "__main__":
    train_risk_model()
