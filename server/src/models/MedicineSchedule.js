const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/crypto');

const medicineScheduleSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
    index: true
  },
  caregiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Sensitive field: Medicine name encrypted with AES-256-GCM
  nameEncrypted: {
    type: String,
    required: true
  },
  // Sensitive field: Strength encrypted with AES-256-GCM (e.g. 650mg, 500mg)
  strengthEncrypted: {
    type: String,
    default: '500mg'
  },
  type: {
    type: String,
    enum: ['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'drops', 'sachet', 'other'],
    default: 'tablet'
  },
  // Stepper, supports half-tablets e.g., 0.5, 1.0, 1.5, 2.0
  tabletsPerDose: {
    type: Number,
    required: true,
    default: 1.0,
    min: 0.25
  },
  timesPerDay: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    max: 8
  },
  // Array of time strings in "HH:mm" 24h format (e.g., ["08:00", "20:00"])
  doseTimes: [{
    type: String,
    required: true
  }],
  foodTiming: {
    type: String,
    enum: ['before food', 'after food', 'with food', 'any time'],
    default: 'after food'
  },
  daysOfWeek: [{
    type: String,
    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  }],
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  tabletsInStock: {
    type: Number,
    required: true,
    default: 10,
    min: 0
  },
  lowStockThresholdDays: {
    type: Number,
    default: 5
  },
  // NON-NEGOTIABLE SAFETY RULE 1:
  // A schedule has status 'draft' | 'confirmed'. The scheduler ignores drafts.
  status: {
    type: String,
    enum: ['draft', 'confirmed'],
    default: 'draft',
    required: true,
    index: true
  },
  // Review gate metadata
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewDurationSeconds: {
    type: Number,
    default: 0
  },
  reviewedFields: {
    name: { type: Boolean, default: false },
    strength: { type: Boolean, default: false },
    tabletsPerDose: { type: Boolean, default: false },
    doseTimes: { type: Boolean, default: false },
    foodTiming: { type: Boolean, default: false },
    duration: { type: Boolean, default: false },
    stock: { type: Boolean, default: false }
  },
  ocrExtracted: {
    type: Boolean,
    default: false
  },
  ocrConfidence: {
    type: Number,
    default: null
  },
  sourceLine: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

medicineScheduleSchema.virtual('name').get(function() {
  return decrypt(this.nameEncrypted);
});
medicineScheduleSchema.virtual('strength').get(function() {
  return decrypt(this.strengthEncrypted);
});

// Helper to set encrypted fields
medicineScheduleSchema.methods.setSensitiveFields = function(data) {
  if (data.name !== undefined) this.nameEncrypted = encrypt(data.name);
  if (data.strength !== undefined) this.strengthEncrypted = encrypt(data.strength);
};

// Plain object with decrypted strings
medicineScheduleSchema.methods.toDecryptedJSON = function() {
  const dailyTotalDose = (this.timesPerDay || 1) * (this.tabletsPerDose || 1);
  const daysOfSupply = dailyTotalDose > 0 ? Math.floor(this.tabletsInStock / dailyTotalDose) : 0;
  
  const supplyEndDate = new Date();
  supplyEndDate.setDate(supplyEndDate.getDate() + daysOfSupply);

  return {
    id: this._id,
    _id: this._id,
    profileId: this.profileId,
    caregiverId: this.caregiverId,
    name: decrypt(this.nameEncrypted),
    strength: decrypt(this.strengthEncrypted),
    type: this.type,
    tabletsPerDose: this.tabletsPerDose,
    timesPerDay: this.timesPerDay,
    doseTimes: this.doseTimes,
    foodTiming: this.foodTiming,
    daysOfWeek: this.daysOfWeek,
    startDate: this.startDate,
    endDate: this.endDate,
    tabletsInStock: this.tabletsInStock,
    daysOfSupplyLeft: daysOfSupply,
    enoughUntilDate: supplyEndDate.toISOString().split('T')[0],
    isLowStock: daysOfSupply <= (this.lowStockThresholdDays || 5),
    status: this.status,
    reviewedAt: this.reviewedAt,
    reviewedBy: this.reviewedBy,
    reviewDurationSeconds: this.reviewDurationSeconds,
    reviewedFields: this.reviewedFields,
    ocrExtracted: this.ocrExtracted,
    ocrConfidence: this.ocrConfidence,
    sourceLine: this.sourceLine,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('MedicineSchedule', medicineScheduleSchema);
