import re
import csv
import os
from typing import List, Dict, Any, Optional
from rapidfuzz import process, fuzz

CATALOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "drugs_catalog.csv")

DRUG_DATABASE: Dict[str, Dict[str, Any]] = {}
DRUG_NAMES: List[str] = []

def load_drug_catalog():
    global DRUG_DATABASE, DRUG_NAMES
    if DRUG_DATABASE:
        return
    if not os.path.exists(CATALOG_PATH):
        return
    with open(CATALOG_PATH, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["name"].strip()
            DRUG_DATABASE[name.lower()] = {
                "name": name,
                "category": row.get("category", ""),
                "default_strength": row.get("default_strength", "500mg"),
                "default_form": row.get("default_form", "tablet"),
                "default_food_timing": row.get("default_food_timing", "after food"),
                "default_frequency": row.get("default_frequency", "BD"),
            }
            DRUG_NAMES.append(name)

load_drug_catalog()

# Regex Patterns
STRENGTH_PATTERN = re.compile(
    r"\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|k\s*iu|%))\b",
    re.IGNORECASE
)

# Frequencies: OD, BD, TDS, QID, 1-0-1, etc.
FREQ_PATTERNS = [
    (re.compile(r"\b1\s*[-–]\s*0\s*[-–]\s*1\b"), "BD (1-0-1)"),
    (re.compile(r"\b1\s*[-–]\s*1\s*[-–]\s*1\b"), "TDS (1-1-1)"),
    (re.compile(r"\b1\s*[-–]\s*0\s*[-–]\s*0\b"), "OD (1-0-0)"),
    (re.compile(r"\b0\s*[-–]\s*0\s*[-–]\s*1\b"), "OD (0-0-1)"),
    (re.compile(r"\b1\s*[-–]\s*1\s*[-–]\s*1\s*[-–]\s*1\b"), "QID (1-1-1-1)"),
    (re.compile(r"\b(?:twice\s+daily|twice\s+a\s+day|bd|bid)\b", re.IGNORECASE), "BD"),
    (re.compile(r"\b(?:thrice\s+daily|three\s+times\s+a\s+day|tds|tid)\b", re.IGNORECASE), "TDS"),
    (re.compile(r"\b(?:once\s+daily|once\s+a\s+day|od|qd)\b", re.IGNORECASE), "OD"),
    (re.compile(r"\b(?:four\s+times\s+daily|qid)\b", re.IGNORECASE), "QID"),
    (re.compile(r"\b(?:sos|prn|as\s+needed)\b", re.IGNORECASE), "PRN (SOS)"),
    (re.compile(r"\b(?:weekly|once\s+a\s+week)\b", re.IGNORECASE), "Weekly"),
    (re.compile(r"\b(?:every\s+(\d+)\s*hours?|q(\d+)h)\b", re.IGNORECASE), "Every 8 hours"),
]

# Food Timing: AC, PC, before food, after food, etc.
FOOD_PATTERNS = [
    (re.compile(r"\b(?:before\s+food|before\s+meals?|empty\s+stomach|a\.?c\.?)\b", re.IGNORECASE), "before food"),
    (re.compile(r"\b(?:after\s+food|after\s+meals?|p\.?c\.?)\b", re.IGNORECASE), "after food"),
    (re.compile(r"\b(?:with\s+food|with\s+meals?)\b", re.IGNORECASE), "with food"),
    (re.compile(r"\b(?:at\s+bedtime|bedtime|night|h\.?s\.?)\b", re.IGNORECASE), "at bedtime"),
]

# Duration: x 5 days, for 7 days, 5 days, 1 week
DURATION_PATTERN = re.compile(
    r"\b(?:x|for|\*)\s*(\d+)\s*(days?|d|weeks?|wks?|months?)\b|\b(\d+)\s*(days?|weeks?)\b",
    re.IGNORECASE
)

# Quantity
QUANTITY_PATTERN = re.compile(
    r"\b(?:qty|total|quantity|#)\s*[:=]?\s*(\d+)\b|\b(\d+)\s*(?:tabs?|tablets?|caps?|capsules?)\b",
    re.IGNORECASE
)

DOSE_PATTERN = re.compile(
    r"\b((?:0\.5|1\.5|[1-4]))\s*(?:tab(?:let)?|cap(?:sule)?|pill|sachet)?\b",
    re.IGNORECASE
)

def find_best_drug_match(text: str) -> Optional[Dict[str, Any]]:
    """Match text against drug catalog using RapidFuzz."""
    if not DRUG_NAMES:
        load_drug_catalog()
    
    clean_text = re.sub(r"[^\w\s-]", " ", text)
    words = clean_text.split()
    
    best_match = None
    highest_score = 0.0

    # Test n-grams up to 3 words
    candidates = []
    for i in range(len(words)):
        for j in range(i + 1, min(i + 4, len(words) + 1)):
            candidates.append(" ".join(words[i:j]))

    if not candidates:
        candidates = [clean_text]

    for cand in candidates:
        if len(cand) < 3:
            continue
        result = process.extractOne(
            cand,
            DRUG_NAMES,
            scorer=fuzz.token_sort_ratio,
            score_cutoff=68.0
        )
        if result:
            matched_name, score, _ = result
            if score > highest_score:
                highest_score = score
                best_match = {
                    "matched_name": matched_name,
                    "score": score / 100.0,
                    "meta": DRUG_DATABASE.get(matched_name.lower(), {})
                }

    return best_match

def parse_line_to_medicine(raw_line: str, ocr_confidence: float = 0.85) -> Optional[Dict[str, Any]]:
    """Extracts medication attributes from an OCR-recognized line."""
    if not raw_line or len(raw_line.strip()) < 3:
        return None

    # 1. Drug Name match
    drug_match = find_best_drug_match(raw_line)
    if not drug_match:
        return None

    drug_name = drug_match["matched_name"]
    meta = drug_match["meta"]
    drug_conf = drug_match["score"]

    field_confidences = {
        "drug": round(drug_conf, 2)
    }

    # 2. Strength
    strength_match = STRENGTH_PATTERN.search(raw_line)
    if strength_match:
        strength = strength_match.group(1).strip()
        field_confidences["strength"] = round(ocr_confidence * 0.95, 2)
    else:
        strength = meta.get("default_strength", "500mg")
        field_confidences["strength"] = 0.60 # Default fallback

    # 3. Frequency
    frequency = None
    for pattern, freq_label in FREQ_PATTERNS:
        if pattern.search(raw_line):
            frequency = freq_label
            field_confidences["frequency"] = round(ocr_confidence * 0.92, 2)
            break
    if not frequency:
        frequency = meta.get("default_frequency", "BD")
        field_confidences["frequency"] = 0.55

    # 4. Food Timing
    food = None
    for pattern, food_label in FOOD_PATTERNS:
        if pattern.search(raw_line):
            food = food_label
            field_confidences["food"] = round(ocr_confidence * 0.90, 2)
            break
    if not food:
        food = meta.get("default_food_timing", "after food")
        field_confidences["food"] = 0.60

    # 5. Dose (e.g., 1 tablet, 0.5 tablet)
    dose = "1 tablet"
    dose_match = DOSE_PATTERN.search(raw_line)
    if dose_match:
        qty_val = dose_match.group(1)
        dose = f"{qty_val} {meta.get('default_form', 'tablet')}"
        field_confidences["dose"] = round(ocr_confidence * 0.88, 2)
    else:
        field_confidences["dose"] = 0.70

    # 6. Duration
    dur_match = DURATION_PATTERN.search(raw_line)
    if dur_match:
        if dur_match.group(1) and dur_match.group(2):
            duration = f"{dur_match.group(1)} {dur_match.group(2)}"
        elif dur_match.group(3) and dur_match.group(4):
            duration = f"{dur_match.group(3)} {dur_match.group(4)}"
        else:
            duration = dur_match.group(0).strip()
        field_confidences["duration"] = round(ocr_confidence * 0.90, 2)
    else:
        duration = "5 days"
        field_confidences["duration"] = 0.50

    # 7. Quantity
    qty_match = QUANTITY_PATTERN.search(raw_line)
    if qty_match:
        q_val = qty_match.group(1) or qty_match.group(2)
        try:
            quantity = int(q_val)
            field_confidences["quantity"] = round(ocr_confidence * 0.95, 2)
        except ValueError:
            quantity = 10
            field_confidences["quantity"] = 0.60
    else:
        # Estimate quantity from duration & frequency
        quantity = 10
        field_confidences["quantity"] = 0.50

    # Composite overall confidence
    overall_conf = round(
        (field_confidences["drug"] * 0.4 +
         field_confidences["strength"] * 0.2 +
         field_confidences["frequency"] * 0.2 +
         field_confidences["food"] * 0.1 +
         field_confidences["duration"] * 0.1),
        2
    )

    return {
        "drug": drug_name,
        "strength": strength,
        "dose": dose,
        "frequency": frequency,
        "duration": duration,
        "food": food,
        "quantity": quantity,
        "confidence": overall_conf,
        "sourceLine": raw_line.strip(),
        "fieldConfidences": field_confidences
    }

def parse_extracted_lines(lines_with_conf: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse all OCR extracted text lines into structured medicines."""
    seen_drugs = set()
    medicines = []

    for item in lines_with_conf:
        text = item.get("text", "")
        conf = item.get("confidence", 0.85)
        parsed = parse_line_to_medicine(text, conf)
        if parsed and parsed["drug"].lower() not in seen_drugs:
            seen_drugs.add(parsed["drug"].lower())
            medicines.append(parsed)

    return medicines
