import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If redirected from registration or from another page
  const successMessage = location.state?.registeredMessage;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success && result.user) {
      // Role-based destination redirect
      switch (result.user.role) {
        case 'caregiver':
          navigate('/dashboard', { replace: true });
          break;
        case 'patient':
          navigate('/my-schedule', { replace: true });
          break;
        case 'doctor':
          navigate('/patient-overview', { replace: true });
          break;
        default:
          navigate('/dashboard', { replace: true });
      }
    } else {
      setErrorMessage(result.error || 'Invalid email or password.');
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-badge">Secure Access</div>
          <h1 className="auth-title">Welcome to RecoverTrack</h1>
          <p className="auth-subtitle">
            Sign in to manage post-surgery medications, reminders, and patient recovery
          </p>
        </div>

        {successMessage && (
          <div className="alert alert-success" role="alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-error" role="alert" id="login-error-alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Email Address</label>
            <div className="input-wrapper">
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="caregiver@hospital.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Password</label>
            <div className="input-wrapper">
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            id="btn-login-submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner-sm"></span>
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="auth-card-footer">
          <p className="footer-text">
            Don't have an account yet?{' '}
            <Link to="/register" className="auth-link" id="link-to-register">
              Create an account
            </Link>
          </p>
          <div className="safety-disclaimer">
            🛡️ RecoverTrack is a medication reminder and adherence tracking tool. It does not provide medical diagnosis or advice.
          </div>
        </div>
      </div>
    </div>
  );
}
