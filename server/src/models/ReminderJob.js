const mongoose = require('mongoose');

const reminderJobSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true,
    index: true
  },
  medicineScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicineSchedule',
    required: true
  },
  doseEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoseEvent',
    required: true,
    unique: true // Strict idempotency: exactly one job document per dose event!
  },
  fireAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled'],
    default: 'pending',
    index: true
  },
  // List of channels successfully dispatched to ('webpush', 'telegram', 'email', 'whatsapp')
  channelsSent: [{
    type: String
  }],
  // Caregiver alert flag: if dose untaken 60 minutes after scheduled time
  alert60MinSent: {
    type: Boolean,
    default: false,
    index: true
  },
  sentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ReminderJob', reminderJobSchema);
