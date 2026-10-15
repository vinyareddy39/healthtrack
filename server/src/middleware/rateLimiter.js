const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  keyGenerator: (req) => req.headers['x-test-client-ip'] || req.ip,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 scan requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Prescription scan rate limit exceeded. Please wait a few moments.'
  }
});

module.exports = {
  authLimiter,
  scanLimiter
};
