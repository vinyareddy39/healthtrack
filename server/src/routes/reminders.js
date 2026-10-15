const express = require('express');
const router = express.Router();
const { handleTelegramWebhook } = require('../services/telegram');
const { getDailyEmailCount } = require('../services/email');
const { authenticate } = require('../middleware/auth');
const { requireRoles } = require('../middleware/rbac');
const { dispatchDueReminders } = require('../services/scheduler');

// POST /api/reminders/telegram-webhook
router.post('/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    await handleTelegramWebhook(update);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reminders/status (Caregiver check)
router.get('/status', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    const emailQuota = getDailyEmailCount();
    return res.json({
      success: true,
      scheduler: 'active',
      emailUsage: {
        sentToday: emailQuota.count,
        dailyCap: emailQuota.limit,
        remaining: Math.max(0, emailQuota.limit - emailQuota.count)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/trigger-now (Caregiver manual trigger for testing)
router.post('/trigger-now', authenticate, requireRoles('caregiver'), async (req, res) => {
  try {
    await dispatchDueReminders();
    return res.json({ success: true, message: 'Scheduler dispatch cycle triggered manually.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
