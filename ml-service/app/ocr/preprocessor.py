import cv2
import numpy as np

def deskew_image(gray: np.ndarray) -> np.ndarray:
    """Detect skew angle and deskew image to make text horizontal."""
    try:
        # Invert colors so text is foreground
        thresh = cv2.bitwise_not(gray)
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 50:
            return gray
        
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        elif angle > 45:
            angle = 90 - angle
        else:
            angle = -angle
            
        # Only deskew if angle is significant but within reasonable bounds
        if abs(angle) > 0.5 and abs(angle) < 45:
            (h, w) = gray.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            return rotated
    except Exception:
        pass
    return gray

def reduce_glare(image_bgr: np.ndarray) -> np.ndarray:
    """Reduce bright glare spots and normalize contrast across paper."""
    try:
        lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_equalized = clahe.apply(l)
        lab_equalized = cv2.merge((l_equalized, a, b))
        return cv2.cvtColor(lab_equalized, cv2.COLOR_LAB2BGR)
    except Exception:
        return image_bgr

def preprocess_prescription_image(image_bytes: bytes):
    """
    OpenCV preprocessing pipeline:
    1. Decode from memory
    2. Resize to standard resolution
    3. Glare reduction via CLAHE
    4. Grayscale conversion
    5. Denoise with bilateral/Gaussian filtering
    6. Deskew to align text horizontally
    7. Adaptive thresholding
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Invalid image file: could not decode image bytes")

    # 1. Resize if image is too large or too small
    h, w = img_bgr.shape[:2]
    target_width = 1600
    if w != target_width and w > 0:
        ratio = target_width / float(w)
        target_height = int(h * ratio)
        img_bgr = cv2.resize(img_bgr, (target_width, target_height), interpolation=cv2.INTER_AREA if ratio < 1 else cv2.INTER_CUBIC)

    # 2. Glare reduction
    img_glare_reduced = reduce_glare(img_bgr)

    # 3. Grayscale
    gray = cv2.cvtColor(img_glare_reduced, cv2.COLOR_BGR2GRAY)

    # 4. Denoise
    denoised = cv2.GaussianBlur(gray, (3, 3), 0)

    # 5. Deskew
    deskewed = deskew_image(denoised)

    # 6. Adaptive Threshold (Gaussian)
    thresh = cv2.adaptiveThreshold(
        deskewed,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        15,
        10
    )

    return {
        "color": img_bgr,
        "gray": deskewed,
        "thresh": thresh
    }
