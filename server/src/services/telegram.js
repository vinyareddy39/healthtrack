const config = require('../config/env');
const Profile = require('../models/Profile');
const DoseEvent = require('../models/DoseEvent');
const MedicineSchedule = require('../models/MedicineSchedule');
const { encrypt } = require('./crypto');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

async function sendTelegramMessage(chatId, text, inlineKeyboard = null) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log(`[Telegram Mock] Bot token not set. Simulating message to chatId: ${chatId} | Text: ${text}`);
    return { success: true, simulated: true };
  }

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    };

    if (inlineKeyboard) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }

    const response = await fetch(`${TELEGRAM_API_BASE}/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return { success: data.ok, data };
  } catch (err) {
    console.error('[Telegram] Message send failure:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendTelegramReminder(chatId, doseEvent) {
  const text = `<b>🔔 RecoverTrack Dose Reminder</b>\n\n` +
               `Medicine: <b>${doseEvent.medicineName}</b>\n` +
               `Dose: ${doseEvent.dosageDescription}\n` +
               `Timing: ${doseEvent.foodTiming}\n` +
               `Scheduled: ${new Date(doseEvent.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n` +
               `<i>Please log your check-in below:</i>`;

  const inlineKeyboard = [
    [
      { text: '✅ Took It', callback_data: `take:${doseEvent._id}` },
      { text: '⏳ Snooze 30m', callback_data: `snooze:${doseEvent._id}` },
      { text: '⏭ Skip', callback_data: `skip:${doseEvent._id}` }
    ]
  ];

  return sendTelegramMessage(chatId, text, inlineKeyboard);
}

async function handleTelegramWebhook(update) {
  if (!update) return { ok: true };

  // 1. Handle /start <code> command
  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = String(update.message.chat.id);
    const username = update.message.from ? update.message.from.username : null;

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1) {
        const linkCode = parts[1].trim();
        const profile = await Profile.findOne({ telegramLinkCode: linkCode });
        if (profile) {
          profile.telegramChatIdEncrypted = encrypt(chatId);
          if (username) profile.telegramUsername = username;
          await profile.save();

          await sendTelegramMessage(
            chatId,
            `✅ <b>RecoverTrack Profile Connected!</b>\n\n` +
            `This Telegram account is now linked to <b>${profile.name}</b>. You will receive medication reminders directly here with one-tap check-in buttons.`
          );
          return { ok: true, linked: true };
        } else {
          await sendTelegramMessage(
            chatId,
            `⚠️ <b>Invalid or expired link code.</b> Please check the code shown in your RecoverTrack profile settings.`
          );
        }
      } else {
        await sendTelegramMessage(
          chatId,
          `👋 Welcome to <b>RecoverTrack</b>!\nTo connect your notifications, please use the link provided on your patient profile or send <code>/start &lt;YOUR_CODE&gt;</code>.`
        );
      }
    }
  }

  // 2. Handle Callback Queries from Inline Buttons
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data; // e.g. take:<doseEventId>
    const [action, doseId] = data.split(':');

    const dose = await DoseEvent.findById(doseId);
    if (!dose) {
      return answerCallbackQuery(cb.id, 'Dose record not found.');
    }

    if (action === 'take') {
      dose.status = 'taken';
      dose.takenAt = new Date();
      await dose.save();

      // Decrement stock in schedule
      const sched = await MedicineSchedule.findById(dose.scheduleId);
      if (sched && sched.tabletsInStock > 0) {
        sched.tabletsInStock = Math.max(0, sched.tabletsInStock - sched.tabletsPerDose);
        await sched.save();
      }

      await answerCallbackQuery(cb.id, '✅ Logged: Dose taken!');
      await sendTelegramMessage(cb.message.chat.id, `✅ Dose for <b>${dose.medicineName}</b> marked as <b>Taken</b>. Stock updated.`);
    } else if (action === 'snooze') {
      const snoozeTime = new Date(Date.now() + 30 * 60 * 1000);
      dose.status = 'snoozed';
      dose.snoozedUntil = snoozeTime;
      await dose.save();
      await answerCallbackQuery(cb.id, '⏳ Snoozed for 30 minutes.');
      await sendTelegramMessage(cb.message.chat.id, `⏳ Dose for <b>${dose.medicineName}</b> snoozed until ${snoozeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    } else if (action === 'skip') {
      dose.status = 'skipped';
      await dose.save();
      await answerCallbackQuery(cb.id, '⏭ Dose marked as skipped.');
      await sendTelegramMessage(cb.message.chat.id, `⏭ Dose for <b>${dose.medicineName}</b> recorded as <b>Skipped</b>.`);
    }
  }

  return { ok: true };
}

async function answerCallbackQuery(callbackQueryId, text) {
  if (!config.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${config.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (err) {
    // Ignore callback query response errors
  }
}

module.exports = {
  sendTelegramMessage,
  sendTelegramReminder,
  handleTelegramWebhook
};
