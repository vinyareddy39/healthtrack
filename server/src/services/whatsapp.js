const config = require('../config/env');

/**
 * Creates pre-filled WhatsApp click-to-chat URL.
 * Format: https://wa.me/<number>?text=<url_encoded_text>
 * @param {string} rawPhone 
 * @param {string} messageText 
 * @returns {string}
 */
function createWhatsAppClickUrl(rawPhone, messageText) {
  if (!rawPhone) return '';
  // Clean phone number: remove +, -, spaces
  const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Optional automatic sender via Meta WhatsApp Cloud API test number.
 * Behind env flag ENABLE_META_WHATSAPP_API=false by default.
 */
async function sendWhatsAppCloudMessage(recipientPhone, messageText) {
  if (!config.ENABLE_META_WHATSAPP_API) {
    return { success: false, reason: 'AUTOMATIC_MODE_DISABLED', clickUrl: createWhatsAppClickUrl(recipientPhone, messageText) };
  }

  if (!config.META_WHATSAPP_TOKEN || !config.META_WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('[WhatsApp] Meta Cloud API credentials not configured.');
    return { success: false, reason: 'CREDENTIALS_MISSING' };
  }

  try {
    const cleanPhone = String(recipientPhone).replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/v18.0/${config.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: messageText }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`[WhatsApp] Meta Cloud API dispatched message to ${cleanPhone}`);
      return { success: true, data };
    } else {
      console.error('[WhatsApp] Meta Cloud API error:', data);
      return { success: false, error: data };
    }
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

function formatDoseReminderWhatsAppText(doseEvent, patientName) {
  return `*🔔 RecoverTrack Reminder for ${patientName}*\n\n` +
         `💊 *Medicine:* ${doseEvent.medicineName}\n` +
         `📋 *Dose:* ${doseEvent.dosageDescription}\n` +
         `🍽️ *Timing:* ${doseEvent.foodTiming}\n` +
         `⏰ *Time:* ${new Date(doseEvent.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n` +
         `Tap your RecoverTrack check-in screen or reply DONE once taken!\n` +
         `_RecoverTrack is a record-keeping tool. It does not provide medical advice._`;
}

module.exports = {
  createWhatsAppClickUrl,
  sendWhatsAppCloudMessage,
  formatDoseReminderWhatsAppText
};
