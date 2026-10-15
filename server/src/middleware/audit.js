const AuditLog = require('../models/AuditLog');

async function recordAudit({ userId, userEmail, role, action, resource, resourceId, patientProfileId, details, req }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1') : 'unknown';
    const userAgent = req ? (req.headers['user-agent'] || 'unknown') : 'unknown';

    return await AuditLog.create({
      userId: userId || (req && req.user ? req.user.id : null),
      userEmail: userEmail || (req && req.user ? req.user.email : 'system'),
      role: role || (req && req.user ? req.user.role : 'system'),
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : null,
      patientProfileId: patientProfileId || null,
      details: details || {},
      ip,
      userAgent
    });
  } catch (err) {
    console.error('AuditLog error:', err.message);
    return null;
  }
}

module.exports = {
  recordAudit
};
