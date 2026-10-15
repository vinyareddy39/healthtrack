const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { scanLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { scanPrescriptionImage } = require('../services/mlClient');
const { recordAudit } = require('../middleware/audit');

// POST /api/prescriptions/scan
router.post('/scan', authenticate, requireRoles('caregiver'), scanLimiter, upload.single('prescription'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Prescription image file is required.' });
    }

    // STRICT NON-NEGOTIABLE SAFETY RULE:
    // Process image strictly in-memory. Never write to disk or log buffer.
    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname || 'prescription.jpg';
    const mimetype = req.file.mimetype;

    const mlResponse = await scanPrescriptionImage(fileBuffer, filename, mimetype);

    recordAudit({
      userId: req.user.id,
      action: 'SCAN_PRESCRIPTION',
      resource: 'Prescription',
      details: {
        medicinesExtracted: mlResponse.medicines ? mlResponse.medicines.length : 0,
        processingTimeMs: mlResponse.processingTimeMs
      },
      req
    });

    return res.json({
      success: true,
      medicines: mlResponse.medicines || [],
      rawLines: mlResponse.rawLines || [],
      processingTimeMs: mlResponse.processingTimeMs,
      ocrEngineUsed: mlResponse.ocrEngineUsed,
      safetyNotice: 'Check every field against the paper prescription before confirming.'
    });
  } catch (err) {
    console.error('Prescription scan forwarding error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Prescription processing failed: ' + err.message
    });
  }
});

module.exports = router;
