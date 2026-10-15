const webpush = require('web-push');
const config = require('../config/env');

if (
  config.VAPID_PUBLIC_KEY &&
  config.VAPID_PRIVATE_KEY &&
  config.VAPID_PRIVATE_KEY !== 'AVP_TEST_KEY' &&
  !config.VAPID_PRIVATE_KEY.startsWith('AVP_')
) {
  try {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.warn('[WebPush] VAPID initialization warning:', err.message);
  }
}

async function sendWebPushNotification(subscription, payload) {
  try {
    if (!subscription || !subscription.endpoint) return false;
    const notificationPayload = JSON.stringify({
      title: payload.title || 'RecoverTrack Medication Alert',
      body: payload.body || 'Time to take your scheduled dose.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `dose-${payload.doseEventId || Date.now()}`,
      data: {
        doseEventId: payload.doseEventId,
        url: payload.url || '/today',
        actions: [
          { action: 'taken', title: 'Took It' },
          { action: 'snooze', title: 'Snooze 30m' },
          { action: 'skip', title: 'Skip' }
        ]
      }
    });

    await webpush.sendNotification(subscription, notificationPayload);
    return true;
  } catch (err) {
    console.error('[WebPush] Push dispatch failed:', err.message);
    return false;
  }
}

module.exports = {
  sendWebPushNotification
};
