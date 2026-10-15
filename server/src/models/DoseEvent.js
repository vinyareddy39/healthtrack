const mongoose = require('mongoose');

const doseEventSchema = new mongoose.Schema({
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicineSchedule',
    required: true,
    index: true
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
    index: true
  },
  medicineName: {
    type: String,
    required: true
  },
  dosageDescription: {
    type: String,
    default: '1 tablet'
  },
  foodTiming: {
    type: String,
    default: 'after food'
  },
  timeSlot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night'],
    default: 'morning',
    index: true
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'taken', 'skipped', 'missed', 'snoozed'],
    default: 'pending',
    index: true
  },
  takenAt: {
    type: Date,
    default: null
  },
  snoozedUntil: {
    type: Date,
    default: null
  },
  delayMinutes: {
    type: Number,
    default: 0
  },
  recordedByRole: {
    type: String,
    enum: ['caregiver', 'patient', 'system'],
    default: 'caregiver'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DoseEvent', doseEventSchema);
