const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // Fallback to server/.env if present

const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'EMAIL_HASH_SECRET'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  throw new Error(`FATAL: Missing required environment variable(s): ${missingVars.join(', ')}`);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/recovertrack',
  
  // Security
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  EMAIL_HASH_SECRET: process.env.EMAIL_HASH_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'recovertrack_refresh_secret_dev_9837498234234',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',

  // ML Service
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  ML_SHARED_SECRET: process.env.ML_SHARED_SECRET || 'recovertrack_internal_ml_secret_key_884930',

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || 'AVP_TEST_KEY',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@recovertrack.local',

  // Reminders & Messaging
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || 'RecoverTrackBot',
  
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'RecoverTrack <no-reply@recovertrack.local>',

  ENABLE_META_WHATSAPP_API: process.env.ENABLE_META_WHATSAPP_API === 'true',
  META_WHATSAPP_TOKEN: process.env.META_WHATSAPP_TOKEN || '',
  META_WHATSAPP_PHONE_NUMBER_ID: process.env.META_WHATSAPP_PHONE_NUMBER_ID || ''
};
