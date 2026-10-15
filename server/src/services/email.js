const nodemailer = require('nodemailer');
const config = require('../config/env');

const DAILY_LIMIT = 100;
let dailyEmailCount = 0;
let lastResetDate = new Date().toDateString();

function checkAndResetDailyLimit() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyEmailCount = 0;
    lastResetDate = today;
  }
}

let transporter = null;
if (config.SMTP_USER && config.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS
    }
  });
}

async function sendEmailReminder({ to, subject, htmlText, plainText }) {
  checkAndResetDailyLimit();

  // Strict code cap: maximum 100 emails per day
  if (dailyEmailCount >= DAILY_LIMIT) {
    console.warn(`[Email] Daily email limit of ${DAILY_LIMIT} reached. Skipping dispatch to ${to}.`);
    return { success: false, reason: 'DAILY_LIMIT_EXCEEDED' };
  }

  if (!transporter) {
    console.log(`[Email Mock] SMTP not configured. Simulating delivery to: ${to} | Subject: ${subject}`);
    dailyEmailCount++;
    return { success: true, simulated: true, countToday: dailyEmailCount };
  }

  try {
    const info = await transporter.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      text: plainText,
      html: htmlText
    });
    dailyEmailCount++;
    console.log(`[Email] Delivered message ${info.messageId} to ${to}. (${dailyEmailCount}/${DAILY_LIMIT} today)`);
    return { success: true, messageId: info.messageId, countToday: dailyEmailCount };
  } catch (err) {
    console.error(`[Email] Delivery failure to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEmailReminder,
  getDailyEmailCount: () => {
    checkAndResetDailyLimit();
    return { count: dailyEmailCount, limit: DAILY_LIMIT };
  }
};
