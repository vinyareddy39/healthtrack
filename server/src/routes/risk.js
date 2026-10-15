const express = require('express');
const router = express.Router();
const DoseEvent = require('../models/DoseEvent');
const Profile = require('../models/Profile');
const { authenticate } = require('../middleware/auth');
const { verifyPatientAccess } = require('../middleware/rbac');
const { getAdherenceRiskScore } = require('../services/mlClient');
const { recordAudit } = require('../middleware/audit');

// GET /api/risk/:profileId
router.get('/:profileId', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const profile = req.targetProfile;

    // Fetch historical check-in doses only (past 14 days)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const doseHistory = await DoseEvent.find({
      profileId: profile._id,
      scheduledAt: { $gte: fourteenDaysAgo }
    }).sort({ scheduledAt: 1 });

    // STRICT NON-NEGOTIABLE SAFETY RULE:
    // Model receives dose history only. No dosing or prescription recommendation logic.
    const riskResult = await getAdherenceRiskScore(
      doseHistory,
      profile.dischargeDate,
      profile._id
    );

    recordAudit({
      userId: req.user.id,
      action: 'CALCULATE_RISK_SCORE',
      resource: 'Profile',
      resourceId: profile._id,
      patientProfileId: profile._id,
      details: { riskCategory: riskResult.riskCategory },
      req
    });

    return res.json({
      success: true,
      profileId: profile._id,
      patientName: profile.name,
      status: 'Experimental',
      label: 'Experimental Adherence Risk Score',
      riskCategory: riskResult.riskCategory,
      missProbabilityNext24h: riskResult.missProbabilityNext24h,
      topContributingFeatures: riskResult.topContributingFeatures,
      disclaimer: 'Experimental. This app is a reminder and record-keeping tool. It does not give medical advice.',
      modelMetrics: riskResult.modelMetrics || null
    });
  } catch (err) {
    console.error('Risk score computation error:', err.message);
    return res.status(500).json({ success: false, error: 'Risk scoring unavailable: ' + err.message });
  }
});

module.exports = router;
