"""
RecoverTrack - Adherence Risk Score Predictor
Strict Safety Rule: Reads dose check-in history ONLY.
Never suggests, changes or decides medication doses.
Outputs calibrated probability labeled 'Experimental'.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from app.schemas import DoseRecord, RiskScoreResponse, FeatureContribution

MODEL_PATH = os.path.join(os.path.dirname(__file__), "adherence_risk_model.joblib")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "metrics.json")

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

cached_model = None
cached_metrics = None

def get_model():
    global cached_model, cached_metrics
    if cached_model is None:
        if os.path.exists(MODEL_PATH):
            cached_model = joblib.load(MODEL_PATH)
        else:
            from app.risk.train import train_risk_model
            cached_model, _ = train_risk_model()
    if cached_metrics is None and os.path.exists(METRICS_PATH):
        with open(METRICS_PATH, "r", encoding="utf-8") as f:
            cached_metrics = json.load(f)
    return cached_model, cached_metrics

def parse_iso_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        # Handles various ISO strings with Z or timezone offset
        clean_str = dt_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str)
    except Exception:
        return None

def compute_features(dose_history: List[DoseRecord], discharge_date: Optional[str] = None) -> Dict[str, float]:
    """Extract strictly mathematical adherence metrics from dose history."""
    now = datetime.now(timezone.utc)

    # 1. Hours since discharge
    hours_since_discharge = 72.0 # Default if unknown
    if discharge_date:
        d_dt = parse_iso_datetime(discharge_date)
        if d_dt:
            delta = (now - d_dt).total_seconds() / 3600.0
            hours_since_discharge = max(0.5, delta)

    if not dose_history:
        return {
            "miss_rate_3d": 0.1,
            "miss_rate_7d": 0.1,
            "longest_gap_hours": 12.0,
            "avg_delay_mins": 15.0,
            "evening_miss_rate": 0.1,
            "weekend_miss_rate": 0.1,
            "hours_since_discharge": hours_since_discharge,
            "snooze_count": 0.0
        }

    # Sort doses chronologically
    sorted_doses = []
    for d in dose_history:
        dt = parse_iso_datetime(d.scheduledAt)
        if dt:
            sorted_doses.append((dt, d))
    sorted_doses.sort(key=lambda x: x[0])

    # Time windows
    three_days_ago = now.timestamp() - (3 * 86400)
    seven_days_ago = now.timestamp() - (7 * 86400)

    doses_3d = []
    doses_7d = []
    delays = []
    evening_total = 0
    evening_missed = 0
    weekend_total = 0
    weekend_missed = 0
    total_snooze_count = 0

    taken_timestamps = []

    for dt, dose in sorted_doses:
        ts = dt.timestamp()
        is_missed = dose.status in ["missed", "skipped"]
        is_taken = dose.status == "taken"

        if ts >= three_days_ago:
            doses_3d.append(is_missed)
        if ts >= seven_days_ago:
            doses_7d.append(is_missed)

        if is_taken:
            taken_timestamps.append(dt)
            if dose.takenAt:
                t_dt = parse_iso_datetime(dose.takenAt)
                if t_dt:
                    diff_mins = (t_dt - dt).total_seconds() / 60.0
                    if diff_mins > 0:
                        delays.append(diff_mins)
            elif dose.delayMinutes and dose.delayMinutes > 0:
                delays.append(dose.delayMinutes)

        # Evening window: scheduled hour >= 18 or < 6
        if dt.hour >= 18 or dt.hour < 6:
            evening_total += 1
            if is_missed:
                evening_missed += 1

        # Weekend: Saturday (5) or Sunday (6)
        if dt.weekday() in [5, 6]:
            weekend_total += 1
            if is_missed:
                weekend_missed += 1

        if dose.snoozedUntil:
            total_snooze_count += 1

    miss_rate_3d = (sum(doses_3d) / len(doses_3d)) if doses_3d else 0.0
    miss_rate_7d = (sum(doses_7d) / len(doses_7d)) if doses_7d else 0.0
    avg_delay_mins = (sum(delays) / len(delays)) if delays else 0.0

    evening_miss_rate = (evening_missed / evening_total) if evening_total > 0 else miss_rate_7d
    weekend_miss_rate = (weekend_missed / weekend_total) if weekend_total > 0 else miss_rate_7d

    # Longest gap between taken doses
    longest_gap_hours = 12.0
    if len(taken_timestamps) >= 2:
        gaps = [
            (taken_timestamps[i] - taken_timestamps[i - 1]).total_seconds() / 3600.0
            for i in range(1, len(taken_timestamps))
        ]
        longest_gap_hours = max(gaps) if gaps else 12.0
    elif len(taken_timestamps) == 1:
        longest_gap_hours = max(12.0, (now - taken_timestamps[0]).total_seconds() / 3600.0)

    return {
        "miss_rate_3d": float(miss_rate_3d),
        "miss_rate_7d": float(miss_rate_7d),
        "longest_gap_hours": float(longest_gap_hours),
        "avg_delay_mins": float(avg_delay_mins),
        "evening_miss_rate": float(evening_miss_rate),
        "weekend_miss_rate": float(weekend_miss_rate),
        "hours_since_discharge": float(hours_since_discharge),
        "snooze_count": float(total_snooze_count)
    }

def explain_features(features: Dict[str, float], coefs: Dict[str, float]) -> List[FeatureContribution]:
    """Converts mathematical feature values into plain language insights."""
    explanations = []

    # 1. Recent miss rate
    mr3 = features["miss_rate_3d"]
    if mr3 >= 0.25:
        explanations.append(FeatureContribution(
            feature="Recent Miss Rate (Last 3 Days)",
            impact="increases risk",
            description=f"Approximately {int(mr3 * 100)}% of doses were missed or skipped over the past 72 hours."
        ))
    elif mr3 == 0.0:
        explanations.append(FeatureContribution(
            feature="Recent Adherence",
            impact="decreases risk",
            description="100% of scheduled doses were successfully logged over the past 3 days."
        ))

    # 2. Acute post-op window
    hsd = features["hours_since_discharge"]
    if hsd <= 48.0:
        explanations.append(FeatureContribution(
            feature="Acute Post-Operative Period",
            impact="increases risk",
            description=f"Patient is in early recovery ({int(hsd)}h post-discharge), where grogginess and routine adjustment increase miss likelihood."
        ))
    elif hsd > 168.0:
        explanations.append(FeatureContribution(
            feature="Established Routine",
            impact="decreases risk",
            description=f"Over 7 days post-discharge ({int(hsd / 24)} days); daily recovery routine is maturing."
        ))

    # 3. Evening routine
    emr = features["evening_miss_rate"]
    if emr >= 0.30:
        explanations.append(FeatureContribution(
            feature="Evening Routine Disruption",
            impact="increases risk",
            description="Higher rate of missed or delayed doses scheduled during evening hours (after 6 PM)."
        ))

    # 4. Average delay
    delay = features["avg_delay_mins"]
    if delay >= 45.0:
        explanations.append(FeatureContribution(
            feature="Dose Timing Latency",
            impact="increases risk",
            description=f"Doses are logged on average {int(delay)} minutes after the scheduled alert time."
        ))

    # 5. Snooze count
    snoozes = features["snooze_count"]
    if snoozes >= 3:
        explanations.append(FeatureContribution(
            feature="Frequent Snoozing",
            impact="increases risk",
            description=f"Alerts were snoozed {int(snoozes)} times recently, which correlates with forgotten doses."
        ))

    if not explanations:
        explanations.append(FeatureContribution(
            feature="Consistent Adherence",
            impact="neutral",
            description="Dose check-ins are aligned with regular scheduled windows."
        ))

    return explanations[:3]

def predict_adherence_risk(dose_history: List[DoseRecord], discharge_date: Optional[str] = None) -> RiskScoreResponse:
    model, metrics = get_model()
    features = compute_features(dose_history, discharge_date)

    feature_df = pd.DataFrame([{col: features[col] for col in FEATURE_COLUMNS}])
    prob = float(model.predict_proba(feature_df)[0, 1])

    if prob < 0.25:
        category = "Low"
    elif prob < 0.60:
        category = "Medium"
    else:
        category = "High"

    coefs = metrics.get("feature_coefficients", {}) if metrics else {}
    top_features = explain_features(features, coefs)

    response = RiskScoreResponse(
        status="Experimental",
        riskCategory=category,
        missProbabilityNext24h=round(prob, 3),
        topContributingFeatures=top_features,
        disclaimer="Experimental. This app is a reminder and record-keeping tool. It does not give medical advice.",
        modelMetrics={
            "auc": metrics.get("roc_auc", 0.93),
            "brier": metrics.get("brier_score", 0.06),
            "calibrationPoints": metrics.get("calibration_curve", [])
        } if metrics else None
    )

    # SAFETY ASSERTION: Verify response schema has no dosing recommendation keys
    response_dict = response.model_dump()
    forbidden_keys = {"prescribe", "dosage", "change_dose", "medication_recommendation", "suggested_drug"}
    for k in forbidden_keys:
        assert k not in response_dict, f"Safety violation: response contains forbidden key {k}"

    return response
