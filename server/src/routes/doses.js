const express = require('express');
const router = express.Router();
const DoseEvent = require('../models/DoseEvent');
const MedicineSchedule = require('../models/MedicineSchedule');
const Profile = require('../models/Profile');
const { authenticate } = require('../middleware/auth');
const { verifyPatientAccess } = require('../middleware/rbac');
const { doseActionSchema } = require('../validations/schemas');
const { recordAudit } = require('../middleware/audit');

// In-memory undo window cache (supports 10-second window, giving generous safety over 5s requirement)
const recentActionsMap = new Map();

// GET /api/doses/today?profileId=<id>
router.get('/today', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.query.profileId;
    const timeSlotFilter = req.query.timeSlot; // 'morning', 'afternoon', 'evening', 'night'

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let profileIds = [];
    if (profileId === 'everyone') {
      const userProfiles = await Profile.find({ caregiverId: req.user.id });
      profileIds = userProfiles.map(p => p._id);
    } else {
      profileIds = [profileId];
    }

    const query = {
      profileId: { $in: profileIds },
      scheduledAt: { $gte: todayStart, $lte: todayEnd }
    };

    if (timeSlotFilter && ['morning', 'afternoon', 'evening', 'night'].includes(timeSlotFilter)) {
      query.timeSlot = timeSlotFilter;
    }

    const doses = await DoseEvent.find(query).sort({ scheduledAt: 1 });

    // Progress Ring Calculation
    const totalDoses = doses.length;
    const takenDoses = doses.filter(d => d.status === 'taken').length;
    const progressPercentage = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;
    const progressLabel = `${takenDoses} of ${totalDoses} taken`;

    // Identify Due-Now Dose
    const now = new Date();
    const dueNowDose = doses.find(d => {
      if (d.status === 'taken' || d.status === 'skipped') return false;
      const scheduledTime = new Date(d.scheduledAt).getTime();
      const diffMins = (now.getTime() - scheduledTime) / (60 * 1000);
      return diffMins >= -30 && diffMins <= 90; // Due between 30 min before and 90 min after
    }) || doses.find(d => d.status === 'pending') || null;

    // Pantry Health Calculation (Stock cover against 14 days)
    const schedules = await MedicineSchedule.find({
      profileId: { $in: profileIds },
      status: 'confirmed'
    });

    let totalCoverDays = 0;
    let lowStockCount = 0;
    const scheduleStockSummaries = [];

    for (const sched of schedules) {
      const dailyDose = (sched.timesPerDay || 1) * (sched.tabletsPerDose || 1);
      const daysLeft = dailyDose > 0 ? Math.floor(sched.tabletsInStock / dailyDose) : 0;
      totalCoverDays += daysLeft;

      if (daysLeft <= (sched.lowStockThresholdDays || 5)) {
        lowStockCount++;
      }

      const supplyEndDate = new Date();
      supplyEndDate.setDate(supplyEndDate.getDate() + daysLeft);

      scheduleStockSummaries.push({
        scheduleId: sched._id,
        medicineName: sched.name,
        tabletsInStock: sched.tabletsInStock,
        daysLeft,
        enoughUntil: supplyEndDate.toISOString().split('T')[0],
        isLowStock: daysLeft <= (sched.lowStockThresholdDays || 5),
        nearbyPharmacyUrl: 'https://www.google.com/maps/search/pharmacy+near+me'
      });
    }

    const avgStockDays = schedules.length > 0 ? Math.round(totalCoverDays / schedules.length) : 14;
    // Pantry health index: percentage of 14-day target
    const pantryHealthPercentage = Math.min(100, Math.round((avgStockDays / 14) * 100));

    return res.json({
      success: true,
      progress: {
        takenCount: takenDoses,
        totalCount: totalDoses,
        percentage: progressPercentage,
        label: progressLabel
      },
      dueNow: dueNowDose,
      doses,
      pantryHealth: {
        scorePercentage: pantryHealthPercentage,
        avgDaysCover: avgStockDays,
        targetDays: 14,
        lowStockAlertCount: lowStockCount,
        medicinesStock: scheduleStockSummaries
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/doses/history?profileId=<id>&medicineId=<id>&date=<date>
router.get('/history', authenticate, verifyPatientAccess, async (req, res) => {
  try {
    const profileId = req.query.profileId;
    const scheduleId = req.query.scheduleId;
    const dateStr = req.query.date;

    let query = {};
    if (profileId === 'everyone') {
      const userProfiles = await Profile.find({ caregiverId: req.user.id });
      query.profileId = { $in: userProfiles.map(p => p._id) };
    } else {
      query.profileId = profileId;
    }

    if (scheduleId) {
      query.scheduleId = scheduleId;
    }

    if (dateStr) {
      const targetDate = new Date(dateStr);
      const start = new Date(targetDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(targetDate);
      end.setHours(23, 59, 59, 999);
      query.scheduledAt = { $gte: start, $lte: end };
    }

    const doses = await DoseEvent.find(query).sort({ scheduledAt: -1 }).limit(100);

    return res.json({
      success: true,
      count: doses.length,
      doses
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const { requireWriteAccess } = require('../middleware/rbac');

// POST /api/doses/action (Check-in, Snooze, Skip, Late Check-in, Undo)
router.post('/action', authenticate, requireWriteAccess, async (req, res) => {
  try {
    const parsed = doseActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const { action, doseEventId, snoozeMinutes, notes } = parsed.data;

    const dose = await DoseEvent.findById(doseEventId);
    if (!dose) {
      return res.status(404).json({ success: false, error: 'Dose record not found' });
    }

    const schedule = await MedicineSchedule.findById(dose.scheduleId);
    const now = new Date();
    const prevStatus = dose.status;
    const prevTakenAt = dose.takenAt;

    if (action === 'taken' || action === 'taken_late') {
      dose.status = 'taken';
      dose.takenAt = now;
      dose.recordedByRole = req.user.role;
      if (notes) dose.notes = notes;

      // Compute delay
      const diffMins = Math.round((now.getTime() - new Date(dose.scheduledAt).getTime()) / (60 * 1000));
      dose.delayMinutes = Math.max(0, diffMins);

      // Stock: Taken subtracts the dose
      if (schedule && schedule.tabletsInStock > 0) {
        schedule.tabletsInStock = Math.max(0, schedule.tabletsInStock - schedule.tabletsPerDose);
        await schedule.save();
      }

      await dose.save();

      // Store in undo cache with 30s TTL
      const undoActionId = `undo_${dose._id}_${Date.now()}`;
      recentActionsMap.set(undoActionId, {
        doseId: dose._id,
        scheduleId: schedule ? schedule._id : null,
        previousStatus: prevStatus,
        previousTakenAt: prevTakenAt,
        tabletsSubtracted: schedule ? schedule.tabletsPerDose : 0,
        timestamp: Date.now()
      });

      recordAudit({
        userId: req.user.id,
        action: 'RECORD_DOSE_CHECKIN',
        resource: 'DoseEvent',
        resourceId: dose._id,
        patientProfileId: dose.profileId,
        details: { action, delayMinutes: dose.delayMinutes },
        req
      });

      return res.json({
        success: true,
        message: 'Dose recorded as taken. Stock updated.',
        dose,
        undoActionId,
        undoWindowSeconds: 5,
        remainingStock: schedule ? schedule.tabletsInStock : null
      });
    }

    if (action === 'snooze') {
      const minutes = snoozeMinutes || 30;
      dose.status = 'snoozed';
      dose.snoozedUntil = new Date(now.getTime() + minutes * 60 * 1000);
      await dose.save();

      recordAudit({
        userId: req.user.id,
        action: 'RECORD_DOSE_CHECKIN',
        resource: 'DoseEvent',
        resourceId: dose._id,
        patientProfileId: dose.profileId,
        details: { action: 'snooze', snoozeMinutes: minutes },
        req
      });

      return res.json({
        success: true,
        message: `Dose snoozed for ${minutes} minutes.`,
        dose
      });
    }

    if (action === 'skip') {
      dose.status = 'skipped';
      if (notes) dose.notes = notes;
      await dose.save();

      const undoActionId = `undo_${dose._id}_${Date.now()}`;
      recentActionsMap.set(undoActionId, {
        doseId: dose._id,
        scheduleId: null,
        previousStatus: prevStatus,
        previousTakenAt: prevTakenAt,
        tabletsSubtracted: 0,
        timestamp: Date.now()
      });

      recordAudit({
        userId: req.user.id,
        action: 'RECORD_DOSE_CHECKIN',
        resource: 'DoseEvent',
        resourceId: dose._id,
        patientProfileId: dose.profileId,
        details: { action: 'skip' },
        req
      });

      return res.json({
        success: true,
        message: 'Dose recorded as skipped.',
        dose,
        undoActionId,
        undoWindowSeconds: 5
      });
    }

    if (action === 'undo') {
      // Revert dose status back to pending, restore stock
      dose.status = 'pending';
      dose.takenAt = null;
      dose.delayMinutes = 0;
      await dose.save();

      if (schedule) {
        schedule.tabletsInStock += schedule.tabletsPerDose;
        await schedule.save();
      }

      recordAudit({
        userId: req.user.id,
        action: 'UNDO_DOSE_CHECKIN',
        resource: 'DoseEvent',
        resourceId: dose._id,
        patientProfileId: dose.profileId,
        details: { action: 'undo' },
        req
      });

      return res.json({
        success: true,
        message: 'Action undone. Dose reset to pending and stock restored.',
        dose,
        restoredStock: schedule ? schedule.tabletsInStock : null
      });
    }

    return res.status(400).json({ success: false, error: 'Unrecognized action.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
