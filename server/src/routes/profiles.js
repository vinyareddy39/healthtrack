const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Profile = require('../models/Profile');
const MedicineSchedule = require('../models/MedicineSchedule');
const DoseEvent = require('../models/DoseEvent');
const ReminderJob = require('../models/ReminderJob');
const { authenticate } = require('../middleware/auth');
const { requireRoles, verifyPatientAccess } = require('../middleware/rbac');
const { createProfileSchema, updateProfileSchema } = require('../validations/schemas');
const { recordAudit } = require('../middleware/audit');
const { createWhatsAppClickUrl, formatDoseReminderWhatsAppText } = require('../services/whatsapp');

// GET /api/profiles (List accessible profiles)
router.get('/', authenticate, async (req, res) => {
  try {
    let profiles = [];

    if (req.user.role === 'caregiver') {
      profiles = await Profile.find({ caregiverId: req.user.id });
    } else if (req.user.role === 'patient') {
      if (req.user.linkedPatientProfileId) {
        const p = await Profile.findById(req.user.linkedPatientProfileId);
        if (p) profiles = [p];
      }
    } else if (req.user.role === 'doctor') {
      const ids = req.user.accessibleProfileIds || [];
      profiles = await Profile.find({ _id: { $in: ids } });
    }

    const decryptedList = profiles.map(p => p.toDecryptedJSON());
    return res.json({ success: true, profiles: decryptedList });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/profiles (Create profile - caregiver only)
router.post('/', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const linkCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const profile = new Profile({
      caregiverId: req.user.id,
      relation: parsed.data.relation,
      timezone: parsed.data.timezone || 'Asia/Kolkata',
      dischargeDate: parsed.data.dischargeDate ? new Date(parsed.data.dischargeDate) : null,
      telegramLinkCode: linkCode
    });

    profile.setSensitiveFields({
      name: parsed.data.name,
      whatsappNumber: parsed.data.whatsappNumber,
      email: parsed.data.email,
      surgeryType: parsed.data.surgeryType,
      emergencyContact: parsed.data.emergencyContact
    });

    await profile.save();

    recordAudit({
      userId: req.user.id,
      action: 'CREATE_PROFILE',
      resource: 'Profile',
      resourceId: profile._id,
      patientProfileId: profile._id,
      details: { relation: profile.relation },
      req
    });

    return res.status(201).json({
      success: true,
      profile: profile.toDecryptedJSON()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles/:profileId
router.get('/:profileId', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profile = req.targetProfile;
    recordAudit({
      userId: req.user.id,
      action: 'VIEW_PROFILE',
      resource: 'Profile',
      resourceId: profile._id,
      patientProfileId: profile._id,
      req
    });

    return res.json({ success: true, profile: profile.toDecryptedJSON() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/profiles/:profileId (caregiver only)
router.put('/:profileId', authenticate, requireRoles('caregiver'), verifyPatientAccess, async (req, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const profile = req.targetProfile;
    if (parsed.data.relation) profile.relation = parsed.data.relation;
    if (parsed.data.timezone) profile.timezone = parsed.data.timezone;
    if (parsed.data.dischargeDate !== undefined) {
      profile.dischargeDate = parsed.data.dischargeDate ? new Date(parsed.data.dischargeDate) : null;
    }

    profile.setSensitiveFields({
      name: parsed.data.name,
      whatsappNumber: parsed.data.whatsappNumber,
      email: parsed.data.email,
      surgeryType: parsed.data.surgeryType,
      emergencyContact: parsed.data.emergencyContact
    });

    await profile.save();

    recordAudit({
      userId: req.user.id,
      action: 'UPDATE_PROFILE',
      resource: 'Profile',
      resourceId: profile._id,
      patientProfileId: profile._id,
      req
    });

    return res.json({ success: true, profile: profile.toDecryptedJSON() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/profiles/:profileId (caregiver only)
router.delete('/:profileId', authenticate, requireRoles('caregiver'), verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.params.profileId;

    await MedicineSchedule.deleteMany({ profileId });
    await DoseEvent.deleteMany({ profileId });
    await ReminderJob.deleteMany({ profileId });
    await Profile.findByIdAndDelete(profileId);

    recordAudit({
      userId: req.user.id,
      action: 'DELETE_PROFILE',
      resource: 'Profile',
      resourceId: profileId,
      patientProfileId: profileId,
      req
    });

    return res.json({ success: true, message: 'Patient profile and all schedules removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/profiles/:profileId/subscribe-push (Register Web Push subscription)
router.post('/:profileId/subscribe-push', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Valid subscription object required' });
    }

    const profile = req.targetProfile;
    // Add if endpoint doesn't already exist
    const exists = profile.webPushSubscriptions.some(s => s.endpoint === subscription.endpoint);
    if (!exists) {
      profile.webPushSubscriptions.push(subscription);
      await profile.save();
    }

    return res.json({ success: true, message: 'Web Push subscription registered.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles/:profileId/send-next-dose ("Send next dose" quick card)
router.get('/:profileId/send-next-dose', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profile = req.targetProfile;
    const now = new Date();

    // Find next upcoming dose
    const nextDose = await DoseEvent.findOne({
      profileId: profile._id,
      status: { $in: ['pending', 'snoozed'] },
      scheduledAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) }
    }).sort({ scheduledAt: 1 });

    if (!nextDose) {
      return res.json({
        success: true,
        hasNextDose: false,
        message: 'No upcoming doses pending.'
      });
    }

    const patientName = profile.name;
    const plainText = formatDoseReminderWhatsAppText(nextDose, patientName);
    const waUrl = createWhatsAppClickUrl(profile.whatsappNumber, plainText);
    const emailSubject = encodeURIComponent(`Medication Reminder for ${patientName}: ${nextDose.medicineName}`);
    const emailBody = encodeURIComponent(plainText);
    const mailtoUrl = profile.email ? `mailto:${profile.email}?subject=${emailSubject}&body=${emailBody}` : '';

    return res.json({
      success: true,
      hasNextDose: true,
      dose: nextDose,
      patientName,
      whatsAppUrl: waUrl,
      mailtoUrl,
      plainText
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
