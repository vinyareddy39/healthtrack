"""
RecoverTrack - Synthetic Post-Surgery Adherence Dataset Generator
NOTICE: ALL DATA GENERATED HERE IS ENTIRELY SYNTHETIC AND FOR RESEARCH/PROTOTYPING ONLY.
Does not contain real patient health information (PHI).
"""

import numpy as np
import pandas as pd
import os

SYNTHETIC_CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "synthetic_doses.csv")

def generate_synthetic_adherence_data(n_samples: int = 2500, random_seed: int = 42) -> pd.DataFrame:
    np.random.seed(random_seed)

    # 1. Simulate Hours Since Discharge (0 to 336 hours = up to 14 days post-op)
    hours_since_discharge = np.random.exponential(scale=72.0, size=n_samples)
    hours_since_discharge = np.clip(hours_since_discharge, 1.0, 336.0)

    # 2. Acute Post-Op Window indicator (first 48 hours: disorientation, grogginess, pain)
    acute_post_op = (hours_since_discharge <= 48.0).astype(float)

    # 3. Baseline patient adherence propensity (beta distribution)
    baseline_compliance = np.random.beta(a=6.0, b=2.0, size=n_samples) # higher = better adherence

    # 4. Caregiver Fatigue Factor (accumulates after 5 days if intensive schedule)
    caregiver_fatigue = np.maximum(0.0, (hours_since_discharge - 120.0) / 216.0) * np.random.uniform(0.1, 0.4, size=n_samples)

    # 5. Miss Rates over last 3 and 7 days
    # High acute post-op or low baseline increases miss rate
    base_miss_propensity = (1.0 - baseline_compliance) + (acute_post_op * 0.25) + caregiver_fatigue
    base_miss_propensity = np.clip(base_miss_propensity, 0.0, 0.95)

    miss_rate_3d = np.clip(np.random.normal(loc=base_miss_propensity, scale=0.10), 0.0, 1.0)
    miss_rate_7d = np.clip(np.random.normal(loc=base_miss_propensity * 0.9 + 0.05, scale=0.08), 0.0, 1.0)

    # 6. Evening and Weekend Miss Rates (simulating routine disruption)
    evening_miss_rate = np.clip(miss_rate_3d * 1.35 + np.random.uniform(0.0, 0.15, size=n_samples), 0.0, 1.0)
    weekend_miss_rate = np.clip(miss_rate_7d * 1.25 + np.random.uniform(0.0, 0.12, size=n_samples), 0.0, 1.0)

    # 7. Longest Gap between taken doses (hours)
    longest_gap_hours = 8.0 + (miss_rate_7d * 28.0) + (acute_post_op * 8.0) + np.random.exponential(scale=3.0, size=n_samples)
    longest_gap_hours = np.clip(longest_gap_hours, 4.0, 72.0)

    # 8. Average delay past scheduled time (minutes)
    avg_delay_mins = 10.0 + (miss_rate_3d * 90.0) + (evening_miss_rate * 45.0) + np.random.exponential(scale=15.0, size=n_samples)
    avg_delay_mins = np.clip(avg_delay_mins, 0.0, 300.0)

    # 9. Snooze Count (times button was hit)
    snooze_count = np.random.poisson(lam=(avg_delay_mins / 25.0) + (miss_rate_3d * 3.0), size=n_samples)
    snooze_count = np.clip(snooze_count, 0, 15)

    # 10. Ground Truth Target: Missing a dose in the next 24 hours (binary 0 or 1)
    # Log-odds of missing in next 24 hours driven by clinical heuristics:
    # - recent 3-day slip has strong weight
    # - early post-op window has strong weight
    # - evening disruption has strong weight
    # - frequent snoozes and long gaps
    logit = (
        -2.2
        + 3.5 * miss_rate_3d
        + 1.8 * miss_rate_7d
        + 0.9 * (acute_post_op)
        + 1.2 * evening_miss_rate
        + 0.8 * weekend_miss_rate
        + 0.04 * (longest_gap_hours - 12.0)
        + 0.015 * (avg_delay_mins - 20.0)
        + 0.18 * snooze_count
        + 0.5 * caregiver_fatigue
    )
    prob_miss_next_24h = 1.0 / (1.0 + np.exp(-logit))
    miss_next_24h = (np.random.uniform(size=n_samples) < prob_miss_next_24h).astype(int)

    df = pd.DataFrame({
        "miss_rate_3d": np.round(miss_rate_3d, 3),
        "miss_rate_7d": np.round(miss_rate_7d, 3),
        "longest_gap_hours": np.round(longest_gap_hours, 1),
        "avg_delay_mins": np.round(avg_delay_mins, 1),
        "evening_miss_rate": np.round(evening_miss_rate, 3),
        "weekend_miss_rate": np.round(weekend_miss_rate, 3),
        "hours_since_discharge": np.round(hours_since_discharge, 1),
        "snooze_count": snooze_count,
        "miss_next_24h": miss_next_24h,
        "true_prob_synthetic": np.round(prob_miss_next_24h, 3)
    })

    return df

def save_synthetic_dataset():
    os.makedirs(os.path.dirname(SYNTHETIC_CSV_PATH), exist_ok=True)
    df = generate_synthetic_adherence_data()
    df.to_csv(SYNTHETIC_CSV_PATH, index=False)
    print(f"Generated {len(df)} synthetic adherence samples saved to: {SYNTHETIC_CSV_PATH}")
    return df

if __name__ == "__main__":
    save_synthetic_dataset()
