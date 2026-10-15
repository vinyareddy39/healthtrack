const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { decrypt, hashEmail } = require('../src/services/crypto');

jest.setTimeout(60000);

describe('Authentication & Session Management Suite', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.disconnect();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('1. Registration (POST /api/auth/register)', () => {
    it('Register succeeds (201), returns id/name/role only, and stored name and email are encrypted in database', async () => {
      const payload = {
        name: 'Caregiver Alice',
        email: 'alice@hospital.org',
        password: 'Password123',
        role: 'caregiver'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.1')
        .send(payload)
        .expect(201);

      // Verify response structure: id, name, role only
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Caregiver Alice');
      expect(res.body.role).toBe('caregiver');
      expect(res.body.password).toBeUndefined();

      // Verify raw database record is encrypted with AES-256-GCM (enc:v1:...)
      const rawUser = await mongoose.connection.collection('users').findOne({
        _id: new mongoose.Types.ObjectId(res.body.id)
      });

      expect(rawUser).toBeDefined();
      // Name in database must be ciphertext
      expect(rawUser.name).toMatch(/^enc:v1:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+$/);
      expect(rawUser.name).not.toBe('Caregiver Alice');
      expect(decrypt(rawUser.name)).toBe('Caregiver Alice');

      // Email in database must be ciphertext
      expect(rawUser.email).toMatch(/^enc:v1:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+$/);
      expect(rawUser.email).not.toBe('alice@hospital.org');
      expect(decrypt(rawUser.email)).toBe('alice@hospital.org');

      // Email hash must match deterministic HMAC-SHA256
      expect(rawUser.emailHash).toBe(hashEmail('alice@hospital.org'));

      // Password must be hashed with bcrypt cost 12
      expect(rawUser.password).toMatch(/^\$2[aby]\$12\$/);
      expect(rawUser.password).not.toBe('Password123');
    });

    it('Duplicate email returns 409', async () => {
      // Attempt to register same email with leading/trailing whitespace and different case
      const duplicatePayload = {
        name: 'Alice Duplicate',
        email: '  ALICE@HOSPITAL.ORG  ',
        password: 'Password123',
        role: 'caregiver'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.2')
        .send(duplicatePayload)
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('Weak password returns 400', async () => {
      // 1. Less than 8 characters
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.3')
        .send({
          name: 'Bob',
          email: 'bob1@test.org',
          password: 'Pass1', // only 5 chars
          role: 'patient'
        })
        .expect(400);

      // 2. Letters only (no number)
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.4')
        .send({
          name: 'Bob',
          email: 'bob2@test.org',
          password: 'PasswordOnly',
          role: 'patient'
        })
        .expect(400);

      // 3. Numbers only (no letter)
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.5')
        .send({
          name: 'Bob',
          email: 'bob3@test.org',
          password: '12345678',
          role: 'patient'
        })
        .expect(400);
    });

    it('Invalid role returns 400', async () => {
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.1.6')
        .send({
          name: 'Hacker',
          email: 'hacker@test.org',
          password: 'Password123',
          role: 'superadmin' // not in allowed roles
        })
        .expect(400);
    });
  });

  describe('2. Login & Cookie Verification (POST /api/auth/login)', () => {
    it('Login with correct credentials sets an httpOnly cookie, and response has no password hash', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.2.1')
        .send({
          email: 'alice@hospital.org',
          password: 'Password123'
        })
        .expect(200);

      // Verify response body
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Caregiver Alice');
      expect(res.body.role).toBe('caregiver');
      expect(res.body.password).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('$2a$');

      // Verify httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(Array.isArray(cookies)).toBe(true);

      const authCookie = cookies.find(c => c.startsWith('token=') || c.startsWith('access_token='));
      expect(authCookie).toBeDefined();
      expect(authCookie).toMatch(/HttpOnly/i);
      expect(authCookie).toMatch(/SameSite=Lax/i);
    });

    it('Wrong password and unknown email both return the same 401 message', async () => {
      // 1. Unknown email
      const resUnknown = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.2.2')
        .send({
          email: 'nonexistent@hospital.org',
          password: 'Password123'
        })
        .expect(401);

      // 2. Wrong password for existing user
      const resWrongPw = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.2.3')
        .send({
          email: 'alice@hospital.org',
          password: 'WrongPassword999'
        })
        .expect(401);

      // Verify exact same error message
      expect(resUnknown.body.error).toBe('Invalid email or password');
      expect(resWrongPw.body.error).toBe('Invalid email or password');
    });
  });

  describe('3. Session Restore (GET /api/auth/me)', () => {
    it('GET /api/auth/me returns 401 without cookie', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });

    it('GET /api/auth/me returns the user with the cookie', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.3.1')
        .send({
          email: 'alice@hospital.org',
          password: 'Password123'
        })
        .expect(200);

      const authCookie = loginRes.headers['set-cookie'];
      expect(authCookie).toBeDefined();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.name).toBe('Caregiver Alice');
      expect(res.body.email).toBe('alice@hospital.org');
      expect(res.body.role).toBe('caregiver');
    });
  });

  describe('4. Logout (POST /api/auth/logout)', () => {
    it('Logout clears the cookie, and /me returns 401 afterwards', async () => {
      // Log in to obtain active cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.4.1')
        .send({
          email: 'alice@hospital.org',
          password: 'Password123'
        })
        .expect(200);

      const cookie = loginRes.headers['set-cookie'];
      expect(cookie).toBeDefined();

      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(200);

      // Check cookie clear headers
      const clearCookies = logoutRes.headers['set-cookie'];
      expect(clearCookies).toBeDefined();
      const cleared = clearCookies.some(c => c.includes('Expires=Thu, 01 Jan 1970') || c.includes('Max-Age=0') || c.startsWith('token=;') || c.startsWith('access_token=;'));
      expect(cleared).toBe(true);

      // Token should now be revoked and rejected on /me
      await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('5. Role-Based Access Control (RBAC)', () => {
    let patientCookie;
    let doctorCookie;

    beforeAll(async () => {
      // Register Patient
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.5.1')
        .send({
          name: 'Patient Patrick',
          email: 'patient@hospital.org',
          password: 'Password123',
          role: 'patient'
        })
        .expect(201);

      const patientLogin = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.5.2')
        .send({ email: 'patient@hospital.org', password: 'Password123' })
        .expect(200);
      patientCookie = patientLogin.headers['set-cookie'];

      // Register Doctor
      await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.5.3')
        .send({
          name: 'Dr. Gregory House',
          email: 'doctor@hospital.org',
          password: 'Password123',
          role: 'doctor'
        })
        .expect(201);

      const doctorLogin = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.5.4')
        .send({ email: 'doctor@hospital.org', password: 'Password123' })
        .expect(200);
      doctorCookie = doctorLogin.headers['set-cookie'];
    });

    it('A patient gets 403 on a caregiver-only route', async () => {
      // POST /api/schedules/draft is restricted to caregivers
      const res = await request(app)
        .post('/api/schedules/draft')
        .set('Cookie', patientCookie)
        .send({
          profileId: new mongoose.Types.ObjectId(),
          name: 'Paracetamol',
          strength: '500mg',
          doseTimes: ['08:00']
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('A doctor gets 403 on a write route', async () => {
      // POST /api/schedules/draft is restricted to caregivers (doctor gets 403)
      const res = await request(app)
        .post('/api/schedules/draft')
        .set('Cookie', doctorCookie)
        .send({
          profileId: new mongoose.Types.ObjectId(),
          name: 'Amoxicillin',
          strength: '500mg',
          doseTimes: ['08:00']
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Forbidden/i);

      // POST /api/doses/action is also a mutation route where doctor gets 403
      const doseActionRes = await request(app)
        .post('/api/doses/action')
        .set('Cookie', doctorCookie)
        .send({
          action: 'taken',
          doseEventId: new mongoose.Types.ObjectId()
        })
        .expect(403);

      expect(doseActionRes.body.success).toBe(false);
      expect(doseActionRes.body.error).toMatch(/Forbidden/i);
    });
  });

  describe('6. Audit Logging', () => {
    it('LOGIN and LOGOUT audit entries are written to database', async () => {
      const loginLogs = await AuditLog.find({ action: 'LOGIN' });
      expect(loginLogs.length).toBeGreaterThan(0);
      expect(loginLogs[0].resource).toBe('User');
      expect(loginLogs[0].ip).toBeDefined();

      const logoutLogs = await AuditLog.find({ action: 'LOGOUT' });
      expect(logoutLogs.length).toBeGreaterThan(0);
      expect(logoutLogs[0].resource).toBe('User');
    });
  });

  describe('7. Account Deletion (DELETE /api/auth/account)', () => {
    it('DELETE /api/auth/account removes the user and clears the session', async () => {
      // Register temporary user
      const tempUser = {
        name: 'Delete Me',
        email: 'deleteme@hospital.org',
        password: 'Password123',
        role: 'caregiver'
      };

      const regRes = await request(app)
        .post('/api/auth/register')
        .set('x-test-client-ip', '10.0.7.1')
        .send(tempUser)
        .expect(201);

      const userId = regRes.body.id;

      // Log in to get session cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('x-test-client-ip', '10.0.7.2')
        .send({ email: tempUser.email, password: tempUser.password })
        .expect(200);
      const cookie = loginRes.headers['set-cookie'];

      // Delete account
      const delRes = await request(app)
        .delete('/api/auth/account')
        .set('Cookie', cookie)
        .expect(200);

      expect(delRes.body.success).toBe(true);

      // Verify cookie is cleared in response
      const clearCookies = delRes.headers['set-cookie'];
      expect(clearCookies).toBeDefined();

      // Verify user is removed from database
      const userInDb = await User.findById(userId);
      expect(userInDb).toBeNull();

      // Subsequent /me call with deleted session must return 401
      await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('8. Rate Limiting', () => {
    it('Rate limit returns 429 after the limit (10 attempts / 15 min)', async () => {
      const targetIp = '198.51.100.99';
      let lastRes;

      // Send 11 rapid requests from the exact same IP
      for (let i = 0; i < 11; i++) {
        lastRes = await request(app)
          .post('/api/auth/login')
          .set('x-test-client-ip', targetIp)
          .send({
            email: 'rate-limit-test@hospital.org',
            password: 'SomePassword123'
          });
      }

      expect(lastRes.status).toBe(429);
      expect(lastRes.body.error).toMatch(/Too many authentication attempts/i);
    });
  });
});
