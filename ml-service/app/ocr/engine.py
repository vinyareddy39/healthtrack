import asyncio
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image
import torch

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

from app.config import settings

logger = logging.getLogger("recovertrack.ocr")

ocr_lock = asyncio.Lock()

trocr_processor = None
trocr_handwritten_model = None
trocr_printed_model = None
device = "cuda" if (settings.USE_GPU and torch.cuda.is_available()) else "cpu"

def load_trocr_models():
    """Load TrOCR base models once into memory."""
    global trocr_processor, trocr_handwritten_model, trocr_printed_model
    if trocr_processor is not None:
        return
    
    try:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        logger.info(f"Loading TrOCR models on device: {device}...")
        
        # Load processor
        trocr_processor = TrOCRProcessor.from_pretrained(settings.OCR_MODEL_HANDWRITTEN)
        
        # Load handwritten model (base)
        trocr_handwritten_model = VisionEncoderDecoderModel.from_pretrained(
            settings.OCR_MODEL_HANDWRITTEN
        ).to(device)
        trocr_handwritten_model.eval()

        logger.info("TrOCR handwritten model loaded successfully.")
    except Exception as e:
        logger.warning(f"Could not load Hugging Face TrOCR weights: {e}. Will rely on Tesseract and heuristic reader.")

def run_tesseract_on_crop(crop_img: np.ndarray) -> Optional[Dict[str, Any]]:
    """Run Tesseract on a single line crop and return recognized text and confidence."""
    if not PYTESSERACT_AVAILABLE:
        return None
    try:
        # Use line mode (psm 7 or 8)
        data = pytesseract.image_to_data(
            crop_img,
            config="--psm 7 -c tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-/:*#() ",
            output_type=pytesseract.Output.DICT
        )
        words = []
        confs = []
        for i, text in enumerate(data.get("text", [])):
            clean_word = text.strip()
            conf = float(data.get("conf", [0])[i])
            if clean_word and conf > 0:
                words.append(clean_word)
                confs.append(conf)
        if words:
            full_text = " ".join(words)
            avg_conf = sum(confs) / (len(confs) * 100.0)
            return {
                "text": full_text,
                "confidence": round(avg_conf, 2),
                "engine": "tesseract"
            }
    except Exception as e:
        logger.debug(f"Tesseract inference error: {e}")
    return None

def run_trocr_on_crop(pil_img: Image.Image) -> Optional[Dict[str, Any]]:
    """Run TrOCR on single line crop and compute sequence probability."""
    global trocr_processor, trocr_handwritten_model
    if trocr_processor is None or trocr_handwritten_model is None:
        return None
    try:
        pixel_values = trocr_processor(pil_img, return_tensors="pt").pixel_values.to(device)
        with torch.no_grad():
            outputs = trocr_handwritten_model.generate(
                pixel_values,
                return_dict_in_generate=True,
                output_scores=True,
                max_new_tokens=40
            )
            generated_ids = outputs.sequences
            text = trocr_processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()

            # Estimate sequence confidence from log probabilities
            if outputs.scores:
                scores_stack = torch.stack(outputs.scores, dim=1) # (1, seq_len, vocab_size)
                probs = torch.nn.functional.softmax(scores_stack, dim=-1)
                # Take max prob per token
                max_probs = torch.max(probs, dim=-1).values
                mean_conf = float(torch.mean(max_probs).cpu().item())
            else:
                mean_conf = 0.85

            return {
                "text": text,
                "confidence": round(mean_conf, 2),
                "engine": "trocr"
            }
    except Exception as e:
        logger.warning(f"TrOCR inference exception: {e}")
        return None

async def recognize_lines(crops_with_coords: List[Any]) -> List[Dict[str, Any]]:
    """
    Process crops under single-request lock.
    For each line, runs TrOCR and Tesseract, keeping the higher-confidence result.
    """
    async with ocr_lock:
        load_trocr_models()
        recognized_lines = []

        for crop_arr, coords in crops_with_coords:
            if crop_arr.size == 0:
                continue

            # Convert numpy array to PIL
            if len(crop_arr.shape) == 2:
                pil_img = Image.fromarray(crop_arr).convert("RGB")
            else:
                pil_img = Image.fromarray(crop_arr)

            # 1. TrOCR result
            trocr_res = run_trocr_on_crop(pil_img)

            # 2. Tesseract result
            tess_res = run_tesseract_on_crop(crop_arr)

            # 3. Select higher confidence result
            selected = None
            if trocr_res and tess_res:
                if trocr_res["confidence"] >= tess_res["confidence"]:
                    selected = trocr_res
                else:
                    selected = tess_res
            elif trocr_res:
                selected = trocr_res
            elif tess_res:
                selected = tess_res
            else:
                # Basic optical text estimation fallback
                selected = None

            if selected and selected.get("text"):
                recognized_lines.append({
                    "text": selected["text"],
                    "confidence": selected["confidence"],
                    "engine": selected["engine"],
                    "bbox": coords
                })

        return recognized_lines
