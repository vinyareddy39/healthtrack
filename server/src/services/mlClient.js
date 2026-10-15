const config = require('../config/env');

/**
 * Forwards in-memory image buffer to the ML microservice for TrOCR analysis.
 * Image is NEVER written to disk on either service.
 */
async function scanPrescriptionImage(buffer, filename, mimetype) {
  const url = `${config.ML_SERVICE_URL}/ocr/prescription`;

  const blob = new Blob([buffer], { type: mimetype });
  const formData = new FormData();
  formData.append('file', blob, filename);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-ml-secret': config.ML_SHARED_SECRET
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ML Service OCR error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * STRICT SAFETY RULE:
 * Forwards dose check-in history ONLY to the ML microservice.
 * Never forwards medication dosages or requests dosing recommendations.
 */
async function getAdherenceRiskScore(doseHistory, dischargeDate, profileId) {
  const url = `${config.ML_SERVICE_URL}/risk/score`;

  const payload = {
    profileId: String(profileId || 'anonymous'),
    dischargeDate: dischargeDate ? new Date(dischargeDate).toISOString() : null,
    doseHistory: doseHistory.map(d => ({
      doseId: String(d._id || d.id || ''),
      scheduledAt: new Date(d.scheduledAt).toISOString(),
      status: d.status,
      takenAt: d.takenAt ? new Date(d.takenAt).toISOString() : null,
      snoozedUntil: d.snoozedUntil ? new Date(d.snoozedUntil).toISOString() : null,
      delayMinutes: d.delayMinutes || 0
    }))
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ml-secret': config.ML_SHARED_SECRET
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ML Service Risk error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();

  // Safety Assertion: Ensure response is tagged Experimental
  if (!result.status || result.status !== 'Experimental') {
    result.status = 'Experimental';
  }

  return result;
}

module.exports = {
  scanPrescriptionImage,
  getAdherenceRiskScore
};
