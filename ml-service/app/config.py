import os

class Settings:
    SHARED_SECRET: str = os.getenv("SHARED_SECRET", "recovertrack_internal_ml_secret_key_884930")
    ML_PORT: int = int(os.getenv("ML_PORT", "8000"))
    OCR_MODEL_HANDWRITTEN: str = os.getenv("OCR_MODEL_HANDWRITTEN", "microsoft/trocr-base-handwritten")
    OCR_MODEL_PRINTED: str = os.getenv("OCR_MODEL_PRINTED", "microsoft/trocr-base-printed")
    USE_GPU: bool = os.getenv("USE_GPU", "false").lower() == "true"
    MAX_CONCURRENT_OCR: int = int(os.getenv("MAX_CONCURRENT_OCR", "1"))
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "data")
    MODEL_DIR: str = os.path.join(os.path.dirname(__file__), "risk")

settings = Settings()
