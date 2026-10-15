const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  userEmail: {
    type: String,
    default: 'anonymous'
  },
  role: {
    type: String,
    default: 'unknown'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'REGISTER',
      'LOGIN',
      'LOGIN_FAILED',
      'LOGOUT',
      'VIEW_PROFILE',
      'CREATE_PROFILE',
      'UPDATE_PROFILE',
      'DELETE_PROFILE',
      'SCAN_PRESCRIPTION',
      'CREATE_SCHEDULE_DRAFT',
      'REVIEW_CONFIRM_SCHEDULE',
      'UPDATE_SCHEDULE',
      'DELETE_SCHEDULE',
      'RECORD_DOSE_CHECKIN',
      'UNDO_DOSE_CHECKIN',
      'REQUEST_REFILL',
      'CALCULATE_RISK_SCORE',
      'DISPATCH_REMINDER'
    ],
    index: true
  },
  resource: {
    type: String,
    required: true
  },
  resourceId: {
    type: String,
    default: null
  },
  patientProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    default: null,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ip: {
    type: String,
    default: 'unknown'
  },
  userAgent: {
    type: String,
    default: 'unknown'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
