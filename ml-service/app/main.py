import time
import logging
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from app.config import settings
from app.schemas import PrescriptionOCRResponse, RiskScoreRequest, RiskScoreResponse
from app.ocr.preprocessor import preprocess_prescription_image
from app.ocr.line_detector import detect_and_crop_lines
from app.ocr.engine import recognize_lines, load_trocr_models
from app.ocr.parser import parse_extracted_lines
from app.risk.predictor import predict_adherence_risk

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("recovertrack.ml_service")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RecoverTrack ML service...")
    try:
        load_trocr_models()
    except Exception as e:
        logger.warning(f"Background OCR warm-up notice: {e}")
    yield

app = FastAPI(
    title="RecoverTrack ML Service",
    description="Local TrOCR prescription extraction and calibrated adherence risk prediction",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_shared_secret(
    x_ml_secret: Optional[str] = Header(None, alias="x-ml-secret"),
    authorization: Optional[str] = Header(None)
):
    """Verifies that the caller possesses the shared secret."""
    secret = x_ml_secret
    if not secret and authorization and authorization.startswith("Bearer "):
        secret = authorization.split("Bearer ")[1].strip()

    if not secret or secret != settings.SHARED_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing shared secret"
        )
    return True

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "recovertrack-ml",
        "version": "1.0.0",
        "safetyNotice": "Experimental. This app is a reminder and record-keeping tool. It does not give medical advice."
    }

@app.post("/ocr/prescription", response_model=PrescriptionOCRResponse)
async def process_prescription_ocr(
    file: UploadFile = File(...),
    _: bool = Depends(verify_shared_secret)
):
    start_time = time.time()

    # 1. MIME and Size validation
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{file.content_type}'. Must be jpeg, png, or webp."
        )

    # 2. In-memory processing: NEVER saved to disk or logged
    image_bytes = await file.read()
    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum 8 MB limit."
        )

    try:
        # Step 1: OpenCV preprocessing
        preprocessed = preprocess_prescription_image(image_bytes)

        # Step 2: Line detection
        crops_with_coords = detect_and_crop_lines(preprocessed["gray"], preprocessed["thresh"])

        # Step 3: Text recognition (TrOCR + Tesseract fallback)
        recognized_lines = await recognize_lines(crops_with_coords)

        # Step 4: Regex + RapidFuzz parsing
        medicines = parse_extracted_lines(recognized_lines)

        raw_line_texts = [line["text"] for line in recognized_lines]

        proc_time_ms = round((time.time() - start_time) * 1000, 2)

        return PrescriptionOCRResponse(
            medicines=medicines,
            rawLines=raw_line_texts,
            processingTimeMs=proc_time_ms,
            ocrEngineUsed="TrOCR-Base + Tesseract Fallback"
        )
    except Exception as e:
        logger.error(f"OCR processing failure: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR error: {str(e)}"
        )

@app.post("/risk/score", response_model=RiskScoreResponse)
async def calculate_adherence_risk(
    request: RiskScoreRequest,
    _: bool = Depends(verify_shared_secret)
):
    """
    STRICT NON-NEGOTIABLE SAFETY RULE:
    Reads dose history ONLY. It never suggests, changes or decides medication doses.
    """
    try:
        response = predict_adherence_risk(
            dose_history=request.doseHistory,
            discharge_date=request.dischargeDate
        )
        return response
    except Exception as e:
        logger.error(f"Risk calculation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Risk scoring error: {str(e)}"
        )
