const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Profile = require('../models/Profile');
const MedicineSchedule = require('../models/MedicineSchedule');
const DoseEvent = require('../models/DoseEvent');
const ReminderJob = require('../models/ReminderJob');
const AuditLog = require('../models/AuditLog');
const RevokedToken = require('../models/RevokedToken');
const config = require('../config/env');
const { hashEmail } = require('../services/crypto');
const { registerSchema, loginSchema } = require('../validations/schemas');
const { authLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../middleware/audit');

// Precomputed cost-12 dummy bcrypt hash to ensure constant-time response for unknown email
const DUMMY_BCRYPT_HASH = '$2a$12$K1r.mZ0eDkMsm6uC2l7cce6BkVfA6v5V8S67zS7gXg3xK7a.bM9y6';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: config.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: config.NODE_ENV === 'production'
};

function signToken(user) {
  const payload = {
    id: user._id.toString(),
    role: user.role,
    linkedPatientProfileId: user.linkedPatientProfileId,
    accessibleProfileIds: user.accessibleProfileIds
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: '24h'
  });
}

function setAuthCookies(res, token) {
  res.cookie('token', token, COOKIE_OPTIONS);
  res.cookie('access_token', token, COOKIE_OPTIONS);
}

function clearAuthCookies(res) {
  res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
  res.clearCookie('access_token', CLEAR_COOKIE_OPTIONS);
  res.clearCookie('refresh_token', { ...CLEAR_COOKIE_OPTIONS, path: '/api/auth/refresh' });
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const { name, email, password, role, linkedPatientProfileId, accessibleProfileIds } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(normalizedEmail);

    const existingUser = await User.findOne({ emailHash });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }

    const user = new User({
      name,
      email: normalizedEmail,
      emailHash,
      password,
      role,
      linkedPatientProfileId: linkedPatientProfileId || null,
      accessibleProfileIds: accessibleProfileIds || []
    });

    await user.save();

    await recordAudit({
      userId: user._id,
      userEmail: normalizedEmail,
      role: user.role,
      action: 'REGISTER',
      resource: 'User',
      resourceId: user._id,
      details: { role: user.role },
      req
    });

    const token = signToken(user);
    setAuthCookies(res, token);

    return res.status(201).json({
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      token
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }
    return res.status(500).json({ success: false, error: 'Registration error: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(normalizedEmail);

    const user = await User.findOne({ emailHash });

    if (!user) {
      // Prevent timing attacks by executing a full bcrypt compare with equal cost
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

      await recordAudit({
        userId: null,
        userEmail: normalizedEmail,
        role: 'unknown',
        action: 'LOGIN_FAILED',
        resource: 'User',
        details: { reason: 'User not found' },
        req
      });

      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordAudit({
        userId: user._id,
        userEmail: user.email,
        role: user.role,
        action: 'LOGIN_FAILED',
        resource: 'User',
        resourceId: user._id,
        details: { reason: 'Incorrect password' },
        req
      });

      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = signToken(user);
    setAuthCookies(res, token);

    await recordAudit({
      userId: user._id,
      userEmail: user.email,
      role: user.role,
      action: 'LOGIN',
      resource: 'User',
      resourceId: user._id,
      details: { role: user.role },
      req
    });

    return res.json({
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      token
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Login error: ' + err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = (req.cookies && (req.cookies.token || req.cookies.access_token)) ||
      (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (token) {
      try {
        const decoded = jwt.decode(token);
        const expiresAt = decoded && decoded.exp
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);
        await RevokedToken.create({ token, expiresAt });
      } catch (_) {}
    }

    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        userId = decoded.id;
      } catch (_) {}
    }

    await recordAudit({
      userId,
      action: 'LOGOUT',
      resource: 'User',
      req
    });

    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    return res.json({
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      email: user.email,
      linkedPatientProfileId: user.linkedPatientProfileId,
      accessibleProfileIds: user.accessibleProfileIds
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/auth/account (Erase all data - right to be forgotten)
router.delete('/account', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all profiles owned by caregiver
    const profiles = await Profile.find({ caregiverId: userId });
    const profileIds = profiles.map(p => p._id);

    // Delete associated resources
    await MedicineSchedule.deleteMany({ profileId: { $in: profileIds } });
    await DoseEvent.deleteMany({ profileId: { $in: profileIds } });
    await ReminderJob.deleteMany({ profileId: { $in: profileIds } });
    await AuditLog.deleteMany({ patientProfileId: { $in: profileIds } });
    await Profile.deleteMany({ caregiverId: userId });
    await User.findByIdAndDelete(userId);

    clearAuthCookies(res);

    return res.json({
      success: true,
      message: 'Account and all associated clinical records have been completely erased.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Account deletion failed: ' + err.message });
  }
});

module.exports = router;
