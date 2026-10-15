"""
RecoverTrack - Prescription Evaluation Dataset Generator
Generates 20 FICTIONAL synthetic prescription images:
- 10 Clear images (standard contrast, horizontal alignment)
- 10 Degraded images (skew, Gaussian blur, low light, glare, faint print)
Paired with exact ground-truth medication annotations.
"""

import os
import json
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

EVAL_DIR = os.path.dirname(__file__)
IMAGES_DIR = os.path.join(EVAL_DIR, "images")
GROUND_TRUTH_FILE = os.path.join(EVAL_DIR, "ground_truth.json")

FICTIONAL_PRESCRIPTIONS = [
    {
        "id": "rx_01",
        "doctor": "Dr. Sarah Jenkins, MD (Orthopedic Surgery)",
        "patient": "Patient Fictional #1",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Dolo 650", "strength": "650mg", "dose": "1 tablet", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 15},
            {"drug": "Pantop 40", "strength": "40mg", "dose": "1 tablet", "frequency": "OD", "duration": "7 days", "food": "before food", "quantity": 7},
            {"drug": "Augmentin 625", "strength": "625mg", "dose": "1 tablet", "frequency": "BD", "duration": "5 days", "food": "after food", "quantity": 10}
        ]
    },
    {
        "id": "rx_02",
        "doctor": "Dr. Rajesh Sharma, MS (General Surgery)",
        "patient": "Patient Fictional #2",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Tramadol", "strength": "50mg", "dose": "1 capsule", "frequency": "BD", "duration": "3 days", "food": "after food", "quantity": 6},
            {"drug": "Ondansetron", "strength": "4mg", "dose": "1 tablet", "frequency": "TDS", "duration": "3 days", "food": "before food", "quantity": 9},
            {"drug": "Dulcolax 5", "strength": "5mg", "dose": "1 tablet", "frequency": "OD", "duration": "5 days", "food": "at bedtime", "quantity": 5}
        ]
    },
    {
        "id": "rx_03",
        "doctor": "Dr. Elena Rostova, MD (Cardiothoracic Surgery)",
        "patient": "Patient Fictional #3",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Aspirin", "strength": "75mg", "dose": "1 tablet", "frequency": "OD", "duration": "30 days", "food": "after food", "quantity": 30},
            {"drug": "Atorvastatin", "strength": "20mg", "dose": "1 tablet", "frequency": "OD", "duration": "30 days", "food": "at bedtime", "quantity": 30},
            {"drug": "Metoprolol", "strength": "25mg", "dose": "1 tablet", "frequency": "BD", "duration": "14 days", "food": "after food", "quantity": 28}
        ]
    },
    {
        "id": "rx_04",
        "doctor": "Dr. Anand Verma, MD (Surgical Gastroenterology)",
        "patient": "Patient Fictional #4",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Cefixime", "strength": "200mg", "dose": "1 tablet", "frequency": "BD", "duration": "7 days", "food": "after food", "quantity": 14},
            {"drug": "Metronidazole", "strength": "400mg", "dose": "1 tablet", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 15},
            {"drug": "Pan 40", "strength": "40mg", "dose": "1 tablet", "frequency": "OD", "duration": "10 days", "food": "before food", "quantity": 10}
        ]
    },
    {
        "id": "rx_05",
        "doctor": "Dr. Marcus Vance, MD (Spine Surgery)",
        "patient": "Patient Fictional #5",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Pregabalin", "strength": "75mg", "dose": "1 capsule", "frequency": "OD", "duration": "14 days", "food": "at bedtime", "quantity": 14},
            {"drug": "Thiocolchicoside", "strength": "4mg", "dose": "1 capsule", "frequency": "BD", "duration": "5 days", "food": "after food", "quantity": 10},
            {"drug": "Paracetamol", "strength": "650mg", "dose": "1 tablet", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 15}
        ]
    },
    {
        "id": "rx_06",
        "doctor": "Dr. Priya Nair, MS (Obstetrics & Gynecology)",
        "patient": "Patient Fictional #6",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Combiflam", "strength": "400mg/325mg", "dose": "1 tablet", "frequency": "BD", "duration": "4 days", "food": "after food", "quantity": 8},
            {"drug": "Shelcal 500", "strength": "500mg", "dose": "1 tablet", "frequency": "BD", "duration": "30 days", "food": "after food", "quantity": 60},
            {"drug": "Orofer-XT", "strength": "100mg", "dose": "1 tablet", "frequency": "OD", "duration": "30 days", "food": "after food", "quantity": 30}
        ]
    },
    {
        "id": "rx_07",
        "doctor": "Dr. David Kim, MD (Urology)",
        "patient": "Patient Fictional #7",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Tamsulosin", "strength": "0.4mg", "dose": "1 capsule", "frequency": "OD", "duration": "14 days", "food": "after food", "quantity": 14},
            {"drug": "Ciprofloxacin", "strength": "500mg", "dose": "1 tablet", "frequency": "BD", "duration": "5 days", "food": "after food", "quantity": 10},
            {"drug": "Cital", "strength": "15ml", "dose": "1 tablespoon", "frequency": "TDS", "duration": "7 days", "food": "after food", "quantity": 1}
        ]
    },
    {
        "id": "rx_08",
        "doctor": "Dr. Kavita Desai, MD (Internal Medicine)",
        "patient": "Patient Fictional #8",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Telmisartan", "strength": "40mg", "dose": "1 tablet", "frequency": "OD", "duration": "30 days", "food": "after food", "quantity": 30},
            {"drug": "Metformin", "strength": "500mg", "dose": "1 tablet", "frequency": "BD", "duration": "30 days", "food": "after food", "quantity": 60},
            {"drug": "Ecosprin 75", "strength": "75mg", "dose": "1 tablet", "frequency": "OD", "duration": "30 days", "food": "after food", "quantity": 30}
        ]
    },
    {
        "id": "rx_09",
        "doctor": "Dr. Arthur Pendelton, MD (Vascular Surgery)",
        "patient": "Patient Fictional #9",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Eliquis", "strength": "5mg", "dose": "1 tablet", "frequency": "BD", "duration": "14 days", "food": "with food", "quantity": 28},
            {"drug": "Paracetamol", "strength": "650mg", "dose": "1 tablet", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 15},
            {"drug": "Rabeprazole", "strength": "20mg", "dose": "1 tablet", "frequency": "OD", "duration": "14 days", "food": "before food", "quantity": 14}
        ]
    },
    {
        "id": "rx_10",
        "doctor": "Dr. Sunita Rao, MS (ENT)",
        "patient": "Patient Fictional #10",
        "date": "12-Oct-2026",
        "medicines": [
            {"drug": "Amoxicillin", "strength": "500mg", "dose": "1 capsule", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 15},
            {"drug": "Montair-LC", "strength": "10mg/5mg", "dose": "1 tablet", "frequency": "OD", "duration": "7 days", "food": "at bedtime", "quantity": 7},
            {"drug": "Betadine", "strength": "5%", "dose": "1 gargle", "frequency": "TDS", "duration": "5 days", "food": "after food", "quantity": 1}
        ]
    }
]

def render_prescription_image(data, is_degraded=False, degradation_type="clear"):
    width, height = 1200, 1600
    # Clean paper background
    bg_color = (252, 252, 250) if not is_degraded else (225, 222, 215)
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Use default bitmap font
    font_large = ImageFont.load_default()
    font_med = ImageFont.load_default()

    # Draw Clinic Header & Border
    draw.rectangle([(40, 40), (width - 40, height - 40)], outline=(180, 190, 200), width=2)
    draw.rectangle([(50, 50), (width - 50, 160)], fill=(240, 245, 250))
    
    # Header Text
    draw.text((70, 70), "METROPOLITAN SURGICAL CARE CLINIC", fill=(30, 41, 59), font=font_large)
    draw.text((70, 95), data["doctor"], fill=(71, 85, 105), font=font_med)
    draw.text((70, 120), f"Date: {data['date']}   |   Patient: {data['patient']}", fill=(100, 116, 139), font=font_med)

    # Rx Symbol
    draw.text((70, 190), "Rx", fill=(14, 116, 144), font=font_large)
    draw.line([(70, 220), (width - 70, 220)], fill=(203, 213, 225), width=2)

    # Medicine Lines
    y_pos = 260
    for idx, med in enumerate(data["medicines"], 1):
        line_str = f"{idx}. Tab {med['drug']} {med['strength']} - {med['dose']} {med['frequency']} {med['food']} x {med['duration']} (Qty: {med['quantity']})"
        draw.text((70, y_pos), line_str, fill=(15, 23, 42), font=font_med)
        y_pos += 90

    # Instructions footer
    draw.line([(70, 1400), (width - 70, 1400)], fill=(203, 213, 225), width=1)
    draw.text((70, 1430), "Directions: Complete entire prescribed antibiotic course. Take with adequate water.", fill=(100, 116, 139), font=font_med)
    draw.text((70, 1460), "Doctor's Signature: _______________________", fill=(71, 85, 105), font=font_med)

    # Apply degradations if requested
    if is_degraded:
        if degradation_type == "skew":
            angle = random.choice([-7.5, 8.0, -9.0, 6.5])
            img = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(220, 220, 220))
        elif degradation_type == "blur":
            img = img.filter(ImageFilter.GaussianBlur(radius=2.5))
        elif degradation_type == "glare":
            # Add bright glare circle in top-center
            overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            o_draw = ImageDraw.Draw(overlay)
            o_draw.ellipse([(400, 200), (900, 700)], fill=(255, 255, 255, 180))
            img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
        elif degradation_type == "low_light":
            # Darken image
            arr = np.array(img).astype(float) * 0.45
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        elif degradation_type == "faint_print":
            # Very low contrast faded ink
            arr = np.array(img).astype(float)
            arr = arr * 0.35 + 160
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    return img

def generate_all_eval_prescriptions():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    all_eval_data = []

    degradation_modes = [
        "skew", "blur", "glare", "low_light", "faint_print",
        "skew", "blur", "glare", "low_light", "faint_print"
    ]

    # Generate 10 Clear images (rx_clear_01 to rx_clear_10)
    for i in range(10):
        data = FICTIONAL_PRESCRIPTIONS[i]
        img_id = f"eval_clear_{i+1:02d}"
        img = render_prescription_image(data, is_degraded=False, degradation_type="clear")
        file_path = os.path.join(IMAGES_DIR, f"{img_id}.png")
        img.save(file_path)

        all_eval_data.append({
            "image_id": img_id,
            "filename": f"{img_id}.png",
            "is_degraded": False,
            "condition": "clear",
            "ground_truth": data
        })

    # Generate 10 Degraded images (rx_degraded_01 to rx_degraded_10) with identical ground truth
    for i in range(10):
        data = FICTIONAL_PRESCRIPTIONS[i]
        deg_type = degradation_modes[i]
        img_id = f"eval_degraded_{i+1:02d}"
        img = render_prescription_image(data, is_degraded=True, degradation_type=deg_type)
        file_path = os.path.join(IMAGES_DIR, f"{img_id}.png")
        img.save(file_path)

        all_eval_data.append({
            "image_id": img_id,
            "filename": f"{img_id}.png",
            "is_degraded": True,
            "condition": f"degraded_{deg_type}",
            "ground_truth": data
        })

    with open(GROUND_TRUTH_FILE, "w", encoding="utf-8") as f:
        json.dump(all_eval_data, f, indent=2)

    print(f"Generated 20 evaluation prescriptions (10 clear, 10 degraded) in: {IMAGES_DIR}")
    return all_eval_data

if __name__ == "__main__":
    generate_all_eval_prescriptions()
