const express = require('express');
const router = express.Router();
const MedicineSchedule = require('../models/MedicineSchedule');
const DoseEvent = require('../models/DoseEvent');
const ReminderJob = require('../models/ReminderJob');
const Profile = require('../models/Profile');
const { authenticate } = require('../middleware/auth');
const { requireRoles, verifyPatientAccess } = require('../middleware/rbac');
const { scheduleDraftSchema, confirmScheduleSchema, refillSchema } = require('../validations/schemas');
const { recordAudit } = require('../middleware/audit');
const { generateDoseEventsForSchedule } = require('../services/scheduler');

// POST /api/schedules/draft (Creates a schedule in DRAFT status)
// Manual entry and OCR extraction both use this
router.post('/draft', authenticate, requireRoles('caregiver'), verifyPatientAccess, async (req, res) => {
  try {
    const parsed = scheduleDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const data = parsed.data;

    const schedule = new MedicineSchedule({
      profileId: data.profileId,
      caregiverId: req.user.id,
      type: data.type,
      tabletsPerDose: data.tabletsPerDose,
      timesPerDay: data.timesPerDay,
      doseTimes: data.doseTimes,
      foodTiming: data.foodTiming,
      daysOfWeek: data.daysOfWeek,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : null,
      tabletsInStock: data.tabletsInStock,
      lowStockThresholdDays: data.lowStockThresholdDays,
      status: 'draft', // MUST BE DRAFT
      ocrExtracted: data.ocrExtracted || false,
      ocrConfidence: data.ocrConfidence || null,
      sourceLine: data.sourceLine || null
    });

    schedule.setSensitiveFields({
      name: data.name,
      strength: data.strength
    });

    await schedule.save();

    recordAudit({
      userId: req.user.id,
      action: 'CREATE_SCHEDULE_DRAFT',
      resource: 'MedicineSchedule',
      resourceId: schedule._id,
      patientProfileId: schedule.profileId,
      details: { status: 'draft', ocrExtracted: schedule.ocrExtracted },
      req
    });

    return res.status(201).json({
      success: true,
      schedule: schedule.toDecryptedJSON()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/schedules/confirm (NON-NEGOTIABLE SAFETY GATE: Confirms schedule after 100% review)
router.post('/confirm', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const parsed = confirmScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Safety Gate Violation: ' + parsed.error.errors[0].message
      });
    }

    const { scheduleId, reviewDurationSeconds, reviewedFields } = parsed.data;
    const schedule = await MedicineSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    // Verify ownership
    if (schedule.caregiverId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to confirm this schedule' });
    }

    // STRICT CHECK: Every single field must be confirmed true
    const requiredFields = ['name', 'strength', 'tabletsPerDose', 'doseTimes', 'foodTiming', 'duration', 'stock'];
    for (const f of requiredFields) {
      if (!reviewedFields[f]) {
        return res.status(400).json({
          success: false,
          error: `Safety Gate Violation: Field '${f}' was not verified by the caregiver.`
        });
      }
    }

    // Update status to confirmed
    schedule.status = 'confirmed';
    schedule.reviewedAt = new Date();
    schedule.reviewedBy = req.user.id;
    schedule.reviewDurationSeconds = reviewDurationSeconds;
    schedule.reviewedFields = reviewedFields;
    await schedule.save();

    // Now and ONLY now generate dose events and reminders
    const createdEvents = await generateDoseEventsForSchedule(schedule, new Date());

    recordAudit({
      userId: req.user.id,
      action: 'REVIEW_CONFIRM_SCHEDULE',
      resource: 'MedicineSchedule',
      resourceId: schedule._id,
      patientProfileId: schedule.profileId,
      details: { reviewDurationSeconds, generatedDoses: createdEvents.length },
      req
    });

    return res.json({
      success: true,
      message: 'Schedule confirmed by caregiver. Reminders and dose events are now activated.',
      schedule: schedule.toDecryptedJSON(),
      generatedDosesCount: createdEvents.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/schedules/profile/:profileId (Gets schedules for profile or 'everyone')
router.get('/profile/:profileId', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const statusFilter = req.query.status; // 'draft', 'confirmed', or undefined (all)

    let query = {};
    if (profileId === 'everyone') {
      const userProfiles = await Profile.find({ caregiverId: req.user.id });
      query.profileId = { $in: userProfiles.map(p => p._id) };
    } else {
      query.profileId = profileId;
    }

    if (statusFilter && ['draft', 'confirmed'].includes(statusFilter)) {
      query.status = statusFilter;
    }

    const schedules = await MedicineSchedule.find(query).sort({ createdAt: -1 });
    const decryptedList = schedules.map(s => s.toDecryptedJSON());

    return res.json({ success: true, schedules: decryptedList });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/schedules/:scheduleId (caregiver only)
router.put('/:scheduleId', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const schedule = await MedicineSchedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    if (schedule.caregiverId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to edit this schedule' });
    }

    const b = req.body;
    if (b.type) schedule.type = b.type;
    if (b.tabletsPerDose !== undefined) schedule.tabletsPerDose = b.tabletsPerDose;
    if (b.timesPerDay !== undefined) schedule.timesPerDay = b.timesPerDay;
    if (b.doseTimes) schedule.doseTimes = b.doseTimes;
    if (b.foodTiming) schedule.foodTiming = b.foodTiming;
    if (b.daysOfWeek) schedule.daysOfWeek = b.daysOfWeek;
    if (b.tabletsInStock !== undefined) schedule.tabletsInStock = b.tabletsInStock;

    schedule.setSensitiveFields({
      name: b.name,
      strength: b.strength
    });

    await schedule.save();

    recordAudit({
      userId: req.user.id,
      action: 'UPDATE_SCHEDULE',
      resource: 'MedicineSchedule',
      resourceId: schedule._id,
      patientProfileId: schedule.profileId,
      req
    });

    return res.json({ success: true, schedule: schedule.toDecryptedJSON() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/schedules/:scheduleId (caregiver only)
router.delete('/:scheduleId', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const schedule = await MedicineSchedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    if (schedule.caregiverId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to delete this schedule' });
    }

    await DoseEvent.deleteMany({ scheduleId: schedule._id, status: 'pending' });
    await ReminderJob.deleteMany({ medicineScheduleId: schedule._id });
    await MedicineSchedule.findByIdAndDelete(schedule._id);

    recordAudit({
      userId: req.user.id,
      action: 'DELETE_SCHEDULE',
      resource: 'MedicineSchedule',
      resourceId: schedule._id,
      patientProfileId: schedule.profileId,
      req
    });

    return res.json({ success: true, message: 'Schedule and pending reminders deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/schedules/refill (Add tablets to stock)
router.post('/refill', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const parsed = refillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const { scheduleId, addedTablets } = parsed.data;
    const schedule = await MedicineSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    schedule.tabletsInStock += addedTablets;
    await schedule.save();

    recordAudit({
      userId: req.user.id,
      action: 'REQUEST_REFILL',
      resource: 'MedicineSchedule',
      resourceId: schedule._id,
      patientProfileId: schedule.profileId,
      details: { addedTablets, newStock: schedule.tabletsInStock },
      req
    });

    return res.json({
      success: true,
      message: `Added ${addedTablets} tablets to stock. Total stock: ${schedule.tabletsInStock}`,
      schedule: schedule.toDecryptedJSON()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
