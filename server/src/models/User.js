const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt, hashEmail } = require('../services/crypto');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    set: v => (v && !v.startsWith('enc:') ? encrypt(v.toLowerCase().trim()) : v),
    get: v => decrypt(v)
  },
  emailHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    set: v => (v && !v.startsWith('enc:') ? encrypt(v.trim()) : v),
    get: v => decrypt(v)
  },
  role: {
    type: String,
    enum: ['caregiver', 'patient', 'doctor'],
    default: 'caregiver',
    required: true
  },
  // If role === 'patient', links to their patient profile
  linkedPatientProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    default: null
  },
  // If role === 'doctor', stores array of patient profiles doctor is authorized to view
  accessibleProfileIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile'
  }],
  refreshToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Pre-save hook: Hash password with cost 12
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Compare password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Return safe user object (never includes password or emailHash)
userSchema.methods.toSafeObject = function() {
  return {
    id: this._id.toString(),
    _id: this._id,
    name: decrypt(this.get('name', null, { getters: false })),
    email: decrypt(this.get('email', null, { getters: false })),
    role: this.role,
    linkedPatientProfileId: this.linkedPatientProfileId,
    accessibleProfileIds: this.accessibleProfileIds
  };
};

// Static helper to find user by plain email via deterministic hash
userSchema.statics.findByEmail = function(rawEmail) {
  if (!rawEmail) return null;
  const emailHash = hashEmail(rawEmail);
  return this.findOne({ emailHash });
};

module.exports = mongoose.model('User', userSchema);

