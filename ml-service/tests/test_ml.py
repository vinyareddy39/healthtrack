import pytest
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.ocr.parser import parse_line_to_medicine
from app.risk.predictor import predict_adherence_risk
from app.schemas import DoseRecord

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Experimental" in data["safetyNotice"]

def test_unauthorized_access():
    response = client.post("/risk/score", json={"doseHistory": []})
    assert response.status_code == 401

def test_risk_score_no_dosing_fields():
    """
    CRITICAL SAFETY RULE TEST:
    Proves that the adherence risk score endpoint accepts dose history only,
    and returns ONLY risk metrics (probability, category, contributing features),
    and strictly NO medication recommendations, dosage modifications, or dosing fields.
    """
    headers = {"x-ml-secret": settings.SHARED_SECRET}
    payload = {
        "profileId": "patient_test_123",
        "dischargeDate": "2026-10-01T10:00:00Z",
        "doseHistory": [
            {
                "scheduledAt": "2026-10-10T08:00:00Z",
                "status": "taken",
                "takenAt": "2026-10-10T08:15:00Z",
                "delayMinutes": 15
            },
            {
                "scheduledAt": "2026-10-10T20:00:00Z",
                "status": "missed",
                "delayMinutes": 0
            },
            {
                "scheduledAt": "2026-10-11T08:00:00Z",
                "status": "taken",
                "takenAt": "2026-10-11T09:00:00Z",
                "delayMinutes": 60
            },
            {
                "scheduledAt": "2026-10-11T20:00:00Z",
                "status": "skipped",
                "snoozedUntil": "2026-10-11T20:30:00Z",
                "delayMinutes": 0
            }
        ]
    }

    response = client.post("/risk/score", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()

    # 1. Must be marked Experimental
    assert data["status"] == "Experimental"
    assert "Experimental" in data["disclaimer"]

    # 2. Must have probability and risk category
    assert data["riskCategory"] in ["Low", "Medium", "High"]
    assert 0.0 <= data["missProbabilityNext24h"] <= 1.0

    # 3. STRICT PROOF: Verify NO dosing recommendation fields exist in response
    forbidden_keys = [
        "dosage",
        "prescribe",
        "prescribed_dose",
        "recommended_dose",
        "suggested_medicine",
        "medication_change",
        "alter_frequency",
        "new_dose",
        "titrate"
    ]
    for key in forbidden_keys:
        assert key not in data, f"Safety failure: Forbidden key '{key}' found in risk response!"

    # Also check inside topContributingFeatures
    for feat in data.get("topContributingFeatures", []):
        for key in forbidden_keys:
            assert key not in feat, f"Safety failure: Forbidden key '{key}' found in feature contribution!"

def test_ocr_parser_accuracy():
    # Test 1: Dolo 650
    line1 = "Tab Dolo 650mg 1-0-1 x 5 days after food Qty: 10"
    parsed1 = parse_line_to_medicine(line1, ocr_confidence=0.92)
    assert parsed1 is not None
    assert "Dolo" in parsed1["drug"] or "Paracetamol" in parsed1["drug"]
    assert "650" in parsed1["strength"]
    assert "BD" in parsed1["frequency"] or "1-0-1" in parsed1["frequency"]
    assert "after food" in parsed1["food"]
    assert "5" in parsed1["duration"]
    assert parsed1["quantity"] == 10

    # Test 2: Augmentin 625
    line2 = "Cap Augmentin 625 BD for 7 days after meals"
    parsed2 = parse_line_to_medicine(line2, ocr_confidence=0.88)
    assert parsed2 is not None
    assert "Augmentin" in parsed2["drug"] or "Amoxyclav" in parsed2["drug"]
    assert "625" in parsed2["strength"]
    assert parsed2["frequency"] == "BD"
    assert "after" in parsed2["food"]
    assert "7" in parsed2["duration"]

    # Test 3: Pantop 40 empty stomach
    line3 = "Pantop 40 mg OD before food x 10 days"
    parsed3 = parse_line_to_medicine(line3, ocr_confidence=0.95)
    assert parsed3 is not None
    assert "Pantop" in parsed3["drug"] or "Pantoprazole" in parsed3["drug"]
    assert "40" in parsed3["strength"]
    assert parsed3["frequency"] == "OD"
    assert "before food" in parsed3["food"]
