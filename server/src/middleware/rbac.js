const Profile = require('../models/Profile');

/**
 * Ensures user has one of the specified roles.
 * @param  {...string} allowedRoles 
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access restricted. Role '${req.user.role}' is not authorized. Required: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Verifies that the authenticated user has explicit permission to reach the requested patient profile.
 * - Caregiver: must own the patient profile.
 * - Patient: can only reach their own explicitly linked profile.
 * - Doctor: can only reach profiles explicitly listed in accessibleProfileIds.
 */
async function verifyPatientAccess(req, res, next) {
  try {
    const profileId = req.params.profileId || req.body.profileId || req.query.profileId;

    if (!profileId) {
      return res.status(400).json({ success: false, error: 'Patient profile ID is required.' });
    }

    // Special "everyone" filter: only accessible to caregivers for their own profiles
    if (profileId === 'everyone') {
      if (req.user.role !== 'caregiver') {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Aggregated 'Everyone' view is only accessible to caregivers."
        });
      }
      return next();
    }

    const profile = await Profile.findById(profileId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Patient profile not found.' });
    }

    // 1. Caregiver Check
    if (req.user.role === 'caregiver') {
      if (profile.caregiverId.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You are not authorized to access this patient profile.'
        });
      }
    }
    // 2. Patient Check
    else if (req.user.role === 'patient') {
      const linkedId = req.user.linkedPatientProfileId ? req.user.linkedPatientProfileId.toString() : null;
      if (!linkedId || linkedId !== profileId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Patient account is not linked to this patient profile.'
        });
      }
    }
    // 3. Doctor Check
    else if (req.user.role === 'doctor') {
      const accessibleIds = (req.user.accessibleProfileIds || []).map(id => id.toString());
      if (!accessibleIds.includes(profileId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Doctor is not granted clinical access to this patient profile.'
        });
      }
    } else {
      return res.status(403).json({ success: false, error: 'Forbidden: Unknown user role.' });
    }

    req.targetProfile = profile;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error during access verification: ' + err.message });
  }
}

/**
 * Enforces that doctors cannot perform write/mutation actions.
 */
function requireWriteAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated' });
  }

  if (req.user.role === 'doctor') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Doctors have read-only clinical oversight access and cannot modify patient records.'
    });
  }

  next();
}

module.exports = {
  requireRoles,
  verifyPatientAccess,
  requireWriteAccess
};
