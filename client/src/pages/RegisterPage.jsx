import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('caregiver');

  const [submitting, setSubmitting] = useState(false);
  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState('');

  const { register } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const errors = {};

    if (!name.trim() || name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters long.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must contain at least one letter and one number.';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!['caregiver', 'patient', 'doctor'].includes(role)) {
      errors.role = 'Please select a valid role.';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate();
    setClientErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    const result = await register({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role
    });
    setSubmitting(false);

    if (result.success) {
      // Redirect to login with success message
      navigate('/login', {
        state: { registeredMessage: 'Account created successfully! Please sign in with your credentials.' }
      });
    } else {
      setServerError(result.error || 'Registration failed. Please check your information.');
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card auth-card-wide">
        <div className="auth-card-header">
          <div className="auth-badge">Account Registration</div>
          <h1 className="auth-title">Create your RecoverTrack Account</h1>
          <p className="auth-subtitle">
            Securely coordinate patient schedules, prescriptions, and adherence verification
          </p>
        </div>

        {serverError && (
          <div className="alert alert-error" role="alert" id="register-server-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="reg-name" className="form-label">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className={`form-input ${clientErrors.name ? 'input-error' : ''}`}
              placeholder="e.g. Dr. Sarah Jenkins or Priya Sharma"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (clientErrors.name) setClientErrors({ ...clientErrors, name: null });
              }}
              required
              disabled={submitting}
            />
            {clientErrors.name && <span className="field-error-text">{clientErrors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email" className="form-label">Email Address</label>
            <input
              id="reg-email"
              type="email"
              className={`form-input ${clientErrors.email ? 'input-error' : ''}`}
              placeholder="name@domain.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (clientErrors.email) setClientErrors({ ...clientErrors, email: null });
              }}
              required
              disabled={submitting}
            />
            {clientErrors.email && <span className="field-error-text">{clientErrors.email}</span>}
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="reg-password" className="form-label">Password</label>
              <input
                id="reg-password"
                type="password"
                className={`form-input ${clientErrors.password ? 'input-error' : ''}`}
                placeholder="At least 8 chars (letters + numbers)"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (clientErrors.password) setClientErrors({ ...clientErrors, password: null });
                }}
                required
                disabled={submitting}
              />
              {clientErrors.password && <span className="field-error-text">{clientErrors.password}</span>}
            </div>

            <div className="form-group flex-1">
              <label htmlFor="reg-confirm-password" className="form-label">Confirm Password</label>
              <input
                id="reg-confirm-password"
                type="password"
                className={`form-input ${clientErrors.confirmPassword ? 'input-error' : ''}`}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (clientErrors.confirmPassword) setClientErrors({ ...clientErrors, confirmPassword: null });
                }}
                required
                disabled={submitting}
              />
              {clientErrors.confirmPassword && <span className="field-error-text">{clientErrors.confirmPassword}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Select Your Role</label>
            <div className="role-selector-grid">
              <label className={`role-card ${role === 'caregiver' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="caregiver"
                  checked={role === 'caregiver'}
                  onChange={() => setRole('caregiver')}
                  disabled={submitting}
                />
                <div className="role-card-content">
                  <div className="role-card-title">
                    <span className="role-icon">🩺</span>
                    <strong>Caregiver</strong>
                  </div>
                  <p className="role-card-desc">
                    Scan prescriptions, manage dosage schedules, review safety gates, and monitor adherence.
                  </p>
                </div>
              </label>

              <label className={`role-card ${role === 'patient' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="patient"
                  checked={role === 'patient'}
                  onChange={() => setRole('patient')}
                  disabled={submitting}
                />
                <div className="role-card-content">
                  <div className="role-card-title">
                    <span className="role-icon">👤</span>
                    <strong>Patient</strong>
                  </div>
                  <p className="role-card-desc">
                    View daily personal medication timeline, check in doses, and receive timely alerts.
                  </p>
                </div>
              </label>

              <label className={`role-card ${role === 'doctor' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value="doctor"
                  checked={role === 'doctor'}
                  onChange={() => setRole('doctor')}
                  disabled={submitting}
                />
                <div className="role-card-content">
                  <div className="role-card-title">
                    <span className="role-icon">📋</span>
                    <strong>Doctor</strong>
                  </div>
                  <p className="role-card-desc">
                    Read-only clinical overview to review recovery adherence records and historical logs.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            id="btn-register-submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner-sm"></span>
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Complete Registration</span>
            )}
          </button>
        </form>

        <div className="auth-card-footer">
          <p className="footer-text">
            Already have an account?{' '}
            <Link to="/login" className="auth-link" id="link-to-login">
              Sign In here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
