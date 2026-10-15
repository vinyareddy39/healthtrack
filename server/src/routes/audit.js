const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticate } = require('../middleware/auth');
const { requireRoles, verifyPatientAccess } = require('../middleware/rbac');

// GET /api/audit/:profileId (caregiver only)
router.get('/:profileId', authenticate, requireRoles('caregiver'), verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.params.profileId;
    let query = {};

    if (profileId === 'everyone') {
      query.userId = req.user.id;
    } else {
      query.patientProfileId = profileId;
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
