const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

async function authenticate(req, res, next) {
  try {
    let token = null;

    // 1. Check httpOnly cookie (token or access_token)
    if (req.cookies && (req.cookies.token || req.cookies.access_token)) {
      token = req.cookies.token || req.cookies.access_token;
    }
    // 2. Check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    // 3. Check revoked tokens store
    try {
      const isRevoked = await RevokedToken.findOne({ token });
      if (isRevoked) {
        return res.status(401).json({
          success: false,
          error: 'Session has been revoked. Please log in again.'
        });
      }
    } catch (_) {}

    const decoded = jwt.verify(token, config.JWT_SECRET);

    // 4. Load fresh user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    // Attach verified user claims
    req.user = {
      id: user._id.toString(),
      _id: user._id,
      name: user.name, // Decrypted getter
      email: user.email, // Decrypted getter
      role: user.role,
      linkedPatientProfileId: user.linkedPatientProfileId || null,
      accessibleProfileIds: user.accessibleProfileIds || []
    };
    req.authToken = token;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.'
    });
  }
}

module.exports = {
  authenticate,
  requireAuth: authenticate
};
