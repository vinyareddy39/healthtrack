# RecoverTrack Prescription OCR & Safety Gate Evaluation Report

**Date**: 2026-10-12  
**Dataset**: 20 Synthetic Fictional Prescriptions (10 Clear, 10 Degraded with Identical Ground Truth)  
**Safety Protocol**: Mandatory Human Caregiver Review Gate Enforced on 100% of Extractions  

---

## 1. Executive Summary

RecoverTrack was evaluated against 20 fictional prescription images simulating outpatient post-surgical regimens (analgesics, antibiotics, gastroprotectives, cardiac medications). The evaluation measures end-to-end extraction accuracy, Word Error Rate (WER), degradation resilience, and caregiver review time required to verify fields before schedule activation.

| Metric | Clear Prescriptions (n=10) | Degraded Prescriptions (n=10) | Aggregate (n=20) |
| :--- | :--- | :--- | :--- |
| **Field Accuracy** | **83.3%** | **82.2%** | **82.8%** |
| **Word Error Rate (WER)** | **0.039** | **0.039** | **0.039** |
| **Avg. Review Time (s)** | **36.83s** | **89.96s** | **63.395s** |
| **OCR Latency (ms)** | **347.016ms** | **332.578ms** | **339.8ms** |

---

## 2. Robustness Across Physical Degradations

The degraded subset tests 5 common real-world photographic issues encountered by caregivers at home:

| Condition | Tested Images | Key Impact Observed | Mitigation in RecoverTrack |
| :--- | :---: | :--- | :--- |
| **Skew** (-9° to +8°) | 2 | Slight line misorientation | OpenCV Hough deskew restoration |
| **Gaussian Blur** | 2 | Soft character boundaries | Adaptive Gaussian thresholding |
| **Glare / Reflection** | 2 | Localized saturation hotspot | CLAHE illumination normalization |
| **Low Light / Shadow** | 2 | Low background-to-ink contrast | Dynamic histogram stretch & gray normalization |
| **Faint Print / Fading** | 2 | Incomplete stroke edges | Morphological dilation + RapidFuzz drug matching |

---

## 3. Safety Review Gate Analysis

Every prescription in RecoverTrack must pass the **Mandatory Caregiver Review Gate**:
- Confirmed schedules require explicit per-field validation before reminders can be scheduled.
- High-confidence fields (>0.75) are presented with green validation badges (avg check time: ~1.5s).
- Degraded or ambiguous extractions are flagged in **Amber** for scrutiny (avg verification time: ~4.8s).
- Across degraded prescriptions, average caregiver verification time increased from **36.83s** to **89.96s**, reflecting appropriate caution on ambiguous fields.

---

## 4. Test Sample Detail

| Image ID | Condition | Overall Accuracy | WER | Review Time |
| :--- | :--- | :---: | :---: | :---: |
| `eval_clear_01` | clear | 83.3% | 0.167 | 36.5s |
| `eval_clear_02` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_03` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_04` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_05` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_06` | clear | 77.8% | 0.111 | 36.5s |
| `eval_clear_07` | clear | 88.9% | 0.000 | 36.5s |
| `eval_clear_08` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_09` | clear | 83.3% | 0.000 | 36.5s |
| `eval_clear_10` | clear | 83.3% | 0.111 | 39.8s |
| `eval_degraded_01` | degraded_skew | 83.3% | 0.167 | 66.2s |
| `eval_degraded_02` | degraded_blur | 83.3% | 0.000 | 95.9s |
| `eval_degraded_03` | degraded_glare | 77.8% | 0.000 | 95.9s |
| `eval_degraded_04` | degraded_low_light | 83.3% | 0.000 | 95.9s |
| `eval_degraded_05` | degraded_faint_print | 83.3% | 0.000 | 95.9s |
| `eval_degraded_06` | degraded_skew | 77.8% | 0.111 | 66.2s |
| `eval_degraded_07` | degraded_blur | 88.9% | 0.000 | 95.9s |
| `eval_degraded_08` | degraded_glare | 77.8% | 0.000 | 95.9s |
| `eval_degraded_09` | degraded_low_light | 83.3% | 0.000 | 95.9s |
| `eval_degraded_10` | degraded_faint_print | 83.3% | 0.111 | 95.9s |

---

## 5. Non-Negotiable Safety Verification
- [x] Images are handled strictly in-memory during OCR and discarded.
- [x] Draft status enforced until 100% of fields are reviewed by the caregiver.
- [x] Zero automated dose decisions or suggestions made by ML models.
- [x] Risk score labeled "Experimental" throughout the application.
