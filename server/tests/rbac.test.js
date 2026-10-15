const { requireRoles, verifyPatientAccess } = require('../src/middleware/rbac');
const Profile = require('../src/models/Profile');

jest.mock('../src/models/Profile');

describe('Role-Based Access Control (RBAC) & Patient Linking Rules', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('Rule: requireRoles middleware', () => {
    it('Rule 1: Blocks unauthenticated users with 401', () => {
      req.user = null;
      const middleware = requireRoles('caregiver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('Rule 2: Grants access if user role matches permitted roles', () => {
      req.user = { id: 'u1', role: 'caregiver' };
      const middleware = requireRoles('caregiver', 'doctor');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('Rule 3: Rejects patient attempting to access caregiver-only route with 403', () => {
      req.user = { id: 'u2', role: 'patient' };
      const middleware = requireRoles('caregiver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('Rule 4: Rejects doctor attempting to access caregiver-only route with 403', () => {
      req.user = { id: 'u3', role: 'doctor' };
      const middleware = requireRoles('caregiver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Rule: verifyPatientAccess middleware', () => {
    const ownProfileId = '507f1f77bcf86cd799439011';
    const otherProfileId = '507f1f77bcf86cd799439099';
    const caregiverId = '507f1f77bcf86cd799439022';
    const otherCaregiverId = '507f1f77bcf86cd799439033';

    it('Caregiver Access Rule: Caregiver CAN access their own linked patient profile', async () => {
      req.user = { id: caregiverId, role: 'caregiver' };
      req.params.profileId = ownProfileId;

      Profile.findById.mockResolvedValue({
        _id: ownProfileId,
        caregiverId: caregiverId
      });

      await verifyPatientAccess(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.targetProfile).toBeDefined();
    });

    it('Caregiver Access Rule: Caregiver CANNOT access an unlinked patient profile (403 Forbidden)', async () => {
      req.user = { id: caregiverId, role: 'caregiver' };
      req.params.profileId = otherProfileId;

      Profile.findById.mockResolvedValue({
        _id: otherProfileId,
        caregiverId: otherCaregiverId // Belongs to different caregiver!
      });

      await verifyPatientAccess(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('Caregiver Access Rule: Caregiver CAN access "everyone" aggregated view', async () => {
      req.user = { id: caregiverId, role: 'caregiver' };
      req.params.profileId = 'everyone';

      await verifyPatientAccess(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('Patient Access Rule: Patient CAN access their explicitly linked profile', async () => {
      req.user = {
        id: 'patient_u1',
        role: 'patient',
        linkedPatientProfileId: ownProfileId
      };
      req.params.profileId = ownProfileId;

      Profile.findById.mockResolvedValue({
        _id: ownProfileId,
        caregiverId: caregiverId
      });

      await verifyPatientAccess(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('Patient Access Rule: Patient CANNOT access another patient profile (403 Forbidden)', async () => {
      req.user = {
        id: 'patient_u1',
        role: 'patient',
        linkedPatientProfileId: ownProfileId
      };
      req.params.profileId = otherProfileId;

      Profile.findById.mockResolvedValue({
        _id: otherProfileId,
        caregiverId: caregiverId
      });

      await verifyPatientAccess(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('Patient Access Rule: Patient CANNOT access "everyone" filter (403 Forbidden)', async () => {
      req.user = {
        id: 'patient_u1',
        role: 'patient',
        linkedPatientProfileId: ownProfileId
      };
      req.params.profileId = 'everyone';

      await verifyPatientAccess(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('Doctor Access Rule: Doctor CAN access explicitly assigned patient profile', async () => {
      req.user = {
        id: 'doctor_u1',
        role: 'doctor',
        accessibleProfileIds: [ownProfileId]
      };
      req.params.profileId = ownProfileId;

      Profile.findById.mockResolvedValue({
        _id: ownProfileId,
        caregiverId: caregiverId
      });

      await verifyPatientAccess(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('Doctor Access Rule: Doctor CANNOT access unassigned patient profile (403 Forbidden)', async () => {
      req.user = {
        id: 'doctor_u1',
        role: 'doctor',
        accessibleProfileIds: [ownProfileId]
      };
      req.params.profileId = otherProfileId;

      Profile.findById.mockResolvedValue({
        _id: otherProfileId,
        caregiverId: caregiverId
      });

      await verifyPatientAccess(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('Doctor Access Rule: Doctor CANNOT access "everyone" filter (403 Forbidden)', async () => {
      req.user = {
        id: 'doctor_u1',
        role: 'doctor',
        accessibleProfileIds: [ownProfileId]
      };
      req.params.profileId = 'everyone';

      await verifyPatientAccess(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
