const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/crypto');

const profileSchema = new mongoose.Schema({
  caregiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Sensitive field: Encrypted with AES-256-GCM
  nameEncrypted: {
    type: String,
    required: true
  },
  relation: {
    type: String,
    enum: ['Me', 'Mom', 'Dad', 'Spouse', 'Child', 'Other'],
    default: 'Me'
  },
  // Sensitive field: Encrypted with AES-256-GCM
  whatsappNumberEncrypted: {
    type: String,
    default: null
  },
  // Sensitive field: Encrypted with AES-256-GCM
  emailEncrypted: {
    type: String,
    default: null
  },
  // Sensitive field: Encrypted with AES-256-GCM
  telegramChatIdEncrypted: {
    type: String,
    default: null
  },
  telegramUsername: {
    type: String,
    default: null
  },
  telegramLinkCode: {
    type: String,
    unique: true,
    sparse: true
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
    required: true
  },
  // Sensitive field: Encrypted with AES-256-GCM
  surgeryTypeEncrypted: {
    type: String,
    default: null
  },
  dischargeDate: {
    type: Date,
    default: null
  },
  // Sensitive field: Encrypted with AES-256-GCM
  emergencyContactEncrypted: {
    type: String,
    default: null
  },
  webPushSubscriptions: [{
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String
    },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Decrypted virtual getters
profileSchema.virtual('name').get(function() {
  return decrypt(this.nameEncrypted);
});
profileSchema.virtual('whatsappNumber').get(function() {
  return decrypt(this.whatsappNumberEncrypted);
});
profileSchema.virtual('email').get(function() {
  return decrypt(this.emailEncrypted);
});
profileSchema.virtual('telegramChatId').get(function() {
  return decrypt(this.telegramChatIdEncrypted);
});
profileSchema.virtual('surgeryType').get(function() {
  return decrypt(this.surgeryTypeEncrypted);
});
profileSchema.virtual('emergencyContact').get(function() {
  return decrypt(this.emergencyContactEncrypted);
});

// Helper method to set encrypted values cleanly
profileSchema.methods.setSensitiveFields = function(data) {
  if (data.name !== undefined) this.nameEncrypted = encrypt(data.name);
  if (data.whatsappNumber !== undefined) this.whatsappNumberEncrypted = encrypt(data.whatsappNumber);
  if (data.email !== undefined) this.emailEncrypted = encrypt(data.email);
  if (data.telegramChatId !== undefined) this.telegramChatIdEncrypted = encrypt(data.telegramChatId);
  if (data.surgeryType !== undefined) this.surgeryTypeEncrypted = encrypt(data.surgeryType);
  if (data.emergencyContact !== undefined) this.emergencyContactEncrypted = encrypt(data.emergencyContact);
};

// Generates decrypted plain object for safe API serialization
profileSchema.methods.toDecryptedJSON = function() {
  return {
    id: this._id,
    _id: this._id,
    caregiverId: this.caregiverId,
    name: decrypt(this.nameEncrypted),
    relation: this.relation,
    whatsappNumber: decrypt(this.whatsappNumberEncrypted),
    email: decrypt(this.emailEncrypted),
    telegramChatId: decrypt(this.telegramChatIdEncrypted),
    telegramUsername: this.telegramUsername,
    telegramLinkCode: this.telegramLinkCode,
    timezone: this.timezone,
    surgeryType: decrypt(this.surgeryTypeEncrypted),
    dischargeDate: this.dischargeDate,
    emergencyContact: decrypt(this.emergencyContactEncrypted),
    hasPushSubscription: (this.webPushSubscriptions && this.webPushSubscriptions.length > 0),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('Profile', profileSchema);
