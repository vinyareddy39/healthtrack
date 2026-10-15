import cv2
import numpy as np
from typing import List, Tuple

def detect_and_crop_lines(gray_image: np.ndarray, thresh_image: np.ndarray) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """
    Detects text lines in a document image and returns a list of (cropped_image, (x, y, w, h)).
    Uses morphological dilation with a horizontal structuring element to bridge words into continuous lines.
    """
    h, w = thresh_image.shape[:2]
    # Invert binary image so text pixels are white
    inv_thresh = cv2.bitwise_not(thresh_image)

    # Horizontal rectangular kernel to connect words into line blocks
    kernel_w = max(25, int(w * 0.03))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, 3))
    dilated = cv2.dilate(inv_thresh, kernel, iterations=2)

    # Find contours of lines
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    bounding_boxes = []
    min_line_width = int(w * 0.08)
    min_line_height = 12
    max_line_height = int(h * 0.25)

    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw >= min_line_width and bh >= min_line_height and bh <= max_line_height:
            bounding_boxes.append((x, y, bw, bh))

    # If morphological detection found very few lines (e.g., unusual contrast), use horizontal projection profiling
    if len(bounding_boxes) < 2:
        proj = np.sum(inv_thresh, axis=1)
        in_line = False
        start_y = 0
        threshold_val = np.mean(proj) * 0.3
        
        for y_idx, val in enumerate(proj):
            if val > threshold_val and not in_line:
                in_line = True
                start_y = y_idx
            elif val <= threshold_val and in_line:
                in_line = False
                line_h = y_idx - start_y
                if line_h >= 12:
                    bounding_boxes.append((0, start_y, w, line_h))
        if in_line and (h - start_y) >= 12:
            bounding_boxes.append((0, start_y, w, h - start_y))

    # Sort bounding boxes top-to-bottom (with slight x tolerance for column alignment)
    bounding_boxes.sort(key=lambda b: b[1])

    crops = []
    padding = 6
    for (x, y, bw, bh) in bounding_boxes:
        y1 = max(0, y - padding)
        y2 = min(h, y + bh + padding)
        x1 = max(0, x - padding)
        x2 = min(w, x + bw + padding)
        line_crop = gray_image[y1:y2, x1:x2]
        if line_crop.size > 0:
            crops.append((line_crop, (x1, y1, x2 - x1, y2 - y1)))

    return crops
