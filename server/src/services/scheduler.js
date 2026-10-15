const cron = require('node-cron');
const Profile = require('../models/Profile');
const MedicineSchedule = require('../models/MedicineSchedule');
const DoseEvent = require('../models/DoseEvent');
const ReminderJob = require('../models/ReminderJob');
const User = require('../models/User');

const { sendWebPushNotification } = require('./webpush');
const { sendTelegramReminder, sendTelegramMessage } = require('./telegram');
const { sendEmailReminder } = require('./email');
const { sendWhatsAppCloudMessage, formatDoseReminderWhatsAppText } = require('./whatsapp');

/**
 * Maps an hour of the day into a time slot category.
 */
function getTimeSlot(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Generates DoseEvents for a confirmed schedule for the target date.
 * NON-NEGOTIABLE SAFETY RULE:
 * Absolutely IGNORES draft schedules.
 */
async function generateDoseEventsForSchedule(schedule, targetDate = new Date()) {
  // Enforce Safety Rule 1: Ignore drafts
  if (schedule.status !== 'confirmed') {
    return [];
  }

  const profile = await Profile.findById(schedule.profileId);
  if (!profile) return [];

  const createdEvents = [];
  const doseTimes = schedule.doseTimes || ['08:00'];
  const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

  // Check if schedule is active on this day of week
  if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
    if (!schedule.daysOfWeek.includes(dayName)) {
      return [];
    }
  }

  // Check start and end dates
  const targetDayStart = new Date(targetDate);
  targetDayStart.setHours(0, 0, 0, 0);

  if (schedule.startDate && new Date(schedule.startDate) > targetDayStart) {
    return [];
  }
  if (schedule.endDate && new Date(schedule.endDate) < targetDayStart) {
    return [];
  }

  for (const timeStr of doseTimes) {
    const [h, m] = timeStr.split(':').map(Number);
    const scheduledDate = new Date(targetDate);
    scheduledDate.setHours(h, m, 0, 0);

    // Look for existing dose event to prevent duplicates
    const windowStart = new Date(scheduledDate.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(scheduledDate.getTime() + 15 * 60 * 1000);

    const existing = await DoseEvent.findOne({
      scheduleId: schedule._id,
      profileId: schedule.profileId,
      scheduledAt: { $gte: windowStart, $lte: windowEnd }
    });

    if (!existing) {
      const timeSlot = getTimeSlot(h);
      const doseEvent = await DoseEvent.create({
        scheduleId: schedule._id,
        profileId: schedule.profileId,
        medicineName: schedule.name, // Decrypted virtual getter
        dosageDescription: `${schedule.tabletsPerDose} ${schedule.type}`,
        foodTiming: schedule.foodTiming,
        timeSlot,
        scheduledAt: scheduledDate,
        status: 'pending'
      });
      createdEvents.push(doseEvent);

      // Create associated ReminderJob with strict idempotency
      await ReminderJob.findOneAndUpdate(
        { doseEventId: doseEvent._id },
        {
          $setOnInsert: {
            profileId: schedule.profileId,
            medicineScheduleId: schedule._id,
            doseEventId: doseEvent._id,
            fireAt: scheduledDate,
            status: 'pending',
            channelsSent: [],
            alert60MinSent: false
          }
        },
        { upsert: true }
      );
    }
  }

  return createdEvents;
}

/**
 * Runs generation of dose events for all active confirmed schedules.
 */
async function syncDailyDoseEvents() {
  try {
    // Query ONLY confirmed schedules
    const confirmedSchedules = await MedicineSchedule.find({ status: 'confirmed' });
    const today = new Date();

    for (const sched of confirmedSchedules) {
      await generateDoseEventsForSchedule(sched, today);
    }
  } catch (err) {
    console.error('[Scheduler] Error syncing daily dose events:', err.message);
  }
}

/**
 * Dispatches due reminders across all enabled channels.
 */
async function dispatchDueReminders() {
  try {
    const now = new Date();
    const dueJobs = await ReminderJob.find({
      status: 'pending',
      fireAt: { $lte: now }
    }).populate('doseEventId');

    for (const job of dueJobs) {
      const dose = job.doseEventId;
      if (!dose) {
        job.status = 'cancelled';
        await job.save();
        continue;
      }

      // If dose is already taken or skipped, cancel the job
      if (dose.status === 'taken' || dose.status === 'skipped') {
        job.status = 'cancelled';
        await job.save();
        continue;
      }

      const profile = await Profile.findById(job.profileId);
      if (!profile) continue;

      const channelsDispatched = [];

      // 1. Web Push Notification
      if (profile.webPushSubscriptions && profile.webPushSubscriptions.length > 0) {
        for (const sub of profile.webPushSubscriptions) {
          const sent = await sendWebPushNotification(sub, {
            title: `🔔 Time for ${dose.medicineName}`,
            body: `${dose.dosageDescription} (${dose.foodTiming}). Please log your dose.`,
            doseEventId: dose._id
          });
          if (sent && !channelsDispatched.includes('webpush')) {
            channelsDispatched.push('webpush');
          }
        }
      }

      // 2. Telegram Bot
      if (profile.telegramChatId) {
        const tgRes = await sendTelegramReminder(profile.telegramChatId, dose);
        if (tgRes.success) channelsDispatched.push('telegram');
      }

      // 3. Email Reminder
      if (profile.email) {
        const emailRes = await sendEmailReminder({
          to: profile.email,
          subject: `🔔 Medication Reminder: ${dose.medicineName} (${dose.dosageDescription})`,
          htmlText: `
            <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f766e; margin-top: 0;">RecoverTrack Dose Reminder</h2>
              <p>Hello,</p>
              <p>It is time to take your scheduled medication:</p>
              <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Medicine:</strong> ${dose.medicineName}</p>
                <p><strong>Dose:</strong> ${dose.dosageDescription}</p>
                <p><strong>Instructions:</strong> ${dose.foodTiming}</p>
              </div>
              <p style="font-size: 12px; color: #64748b;">This app is a reminder and record-keeping tool. It does not give medical advice.</p>
            </div>
          `,
          plainText: `RecoverTrack Reminder: Time to take ${dose.medicineName} (${dose.dosageDescription}, ${dose.foodTiming}).`
        });
        if (emailRes.success) channelsDispatched.push('email');
      }

      // 4. WhatsApp Cloud API (if automatic mode enabled)
      if (profile.whatsappNumber) {
        const waText = formatDoseReminderWhatsAppText(dose, profile.name);
        const waRes = await sendWhatsAppCloudMessage(profile.whatsappNumber, waText);
        if (waRes.success) channelsDispatched.push('whatsapp');
      }

      job.status = 'sent';
      job.sentAt = new Date();
      job.channelsSent = channelsDispatched;
      await job.save();
    }
  } catch (err) {
    console.error('[Scheduler] Error in dispatchDueReminders:', err.message);
  }
}

/**
 * 60-Minute Caregiver Alert:
 * If a dose is untaken 60 minutes after its scheduled time,
 * notify the caregiver and other linked family members on their enabled channels.
 */
async function checkCaregiver60MinAlerts() {
  try {
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find jobs where dose is still untaken 60 mins past fireAt and alert has not been sent
    const pendingJobs = await ReminderJob.find({
      status: 'sent',
      fireAt: { $lte: sixtyMinsAgo },
      alert60MinSent: false
    }).populate('doseEventId');

    for (const job of pendingJobs) {
      const dose = job.doseEventId;
      if (!dose) continue;

      // If already taken, no alert needed
      if (dose.status === 'taken' || dose.status === 'skipped') {
        job.alert60MinSent = true;
        await job.save();
        continue;
      }

      // Dose is untaken after 60 minutes!
      dose.status = 'missed';
      await dose.save();

      const profile = await Profile.findById(job.profileId);
      if (!profile) continue;

      const caregiver = await User.findById(profile.caregiverId);
      if (!caregiver) continue;

      const alertMessage = `⚠️ CAREGIVER ALERT: ${profile.name} has not checked in their scheduled dose of ${dose.medicineName} (${dose.dosageDescription}), which was due over 60 minutes ago.`;

      // 1. Notify Caregiver via Email
      if (caregiver.email) {
        await sendEmailReminder({
          to: caregiver.email,
          subject: `⚠️ Caregiver Alert: Untaken Dose for ${profile.name}`,
          htmlText: `
            <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 2px solid #ef4444; border-radius: 8px;">
              <h2 style="color: #dc2626; margin-top: 0;">Caregiver Safety Alert</h2>
              <p><strong>${profile.name}</strong> has not logged their medication dose:</p>
              <div style="background: #fef2f2; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Medicine:</strong> ${dose.medicineName}</p>
                <p><strong>Scheduled At:</strong> ${new Date(dose.scheduledAt).toLocaleTimeString()}</p>
                <p><strong>Status:</strong> Overdue by >60 minutes</p>
              </div>
              <p>Please check on the patient or assist them with their check-in.</p>
              <p style="font-size: 12px; color: #64748b;">This app is a reminder and record-keeping tool. It does not give medical advice.</p>
            </div>
          `,
          plainText: alertMessage
        });
      }

      // 2. Notify Caregiver via Telegram if available
      if (profile.telegramChatId) {
        await sendTelegramMessage(profile.telegramChatId, `⚠️ <b>Caregiver Alert</b>: ${alertMessage}`);
      }

      job.alert60MinSent = true;
      await job.save();
      console.log(`[Scheduler] 60-min missed dose alert triggered for ${profile.name} (${dose.medicineName})`);
    }
  } catch (err) {
    console.error('[Scheduler] Error checking 60-min caregiver alerts:', err.message);
  }
}

/**
 * Initializes cron jobs.
 */
function startScheduler() {
  console.log('[Scheduler] Initializing RecoverTrack Minute Cron Engine...');

  // 1. Sync doses on startup
  syncDailyDoseEvents();

  // 2. Cron schedule running every minute
  cron.schedule('* * * * *', async () => {
    await syncDailyDoseEvents();
    await dispatchDueReminders();
    await checkCaregiver60MinAlerts();
  });
}

module.exports = {
  startScheduler,
  generateDoseEventsForSchedule,
  syncDailyDoseEvents,
  dispatchDueReminders,
  checkCaregiver60MinAlerts
};
