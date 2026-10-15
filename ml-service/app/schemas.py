from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# OCR Schemas
class MedicineExtracted(BaseModel):
    drug: str
    strength: Optional[str] = "N/A"
    dose: Optional[str] = "1 tablet"
    frequency: Optional[str] = "OD"
    duration: Optional[str] = "5 days"
    food: Optional[str] = "after food"
    quantity: Optional[int] = 10
    confidence: float = Field(ge=0.0, le=1.0)
    sourceLine: str
    fieldConfidences: dict = Field(default_factory=dict)

class PrescriptionOCRResponse(BaseModel):
    medicines: List[MedicineExtracted]
    rawLines: List[str]
    processingTimeMs: float
    ocrEngineUsed: str

# Adherence Risk Schemas
# STRICT SAFETY RULE: Reads dose history only! Never accepts or outputs dosing decisions.
class DoseRecord(BaseModel):
    doseId: Optional[str] = None
    scheduledAt: str # ISO 8601 string
    status: str # "taken", "missed", "skipped", "snoozed", "pending"
    takenAt: Optional[str] = None
    snoozedUntil: Optional[str] = None
    delayMinutes: Optional[float] = 0.0

class RiskScoreRequest(BaseModel):
    profileId: Optional[str] = "anonymous"
    dischargeDate: Optional[str] = None # ISO 8601 string
    doseHistory: List[DoseRecord] = Field(..., description="Historical dose check-ins only")

class FeatureContribution(BaseModel):
    feature: str
    impact: str # e.g. "increases risk", "decreases risk", "neutral"
    description: str

class RiskScoreResponse(BaseModel):
    status: str = "Experimental"
    riskCategory: str # "Low", "Medium", "High"
    missProbabilityNext24h: float = Field(ge=0.0, le=1.0)
    topContributingFeatures: List[FeatureContribution]
    disclaimer: str = "Experimental. This app is a reminder and record-keeping tool. It does not give medical advice."
    modelMetrics: Optional[dict] = None
