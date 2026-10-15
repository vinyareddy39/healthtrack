import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotAuthorizedPage() {
  const { user } = useAuth();
  const location = useLocation();
  const attemptedRole = location.state?.attemptedRole || user?.role || 'your role';

  const getFallbackRoute = () => {
    if (!user) return '/login';
    if (user.role === 'caregiver') return '/dashboard';
    if (user.role === 'patient') return '/my-schedule';
    if (user.role === 'doctor') return '/patient-overview';
    return '/';
  };

  return (
    <div className="error-page-container">
      <div className="error-card">
        <div className="error-icon-wrapper warning">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h1 className="error-title">403 — Access Restricted</h1>
        <p className="error-desc">
          You do not have permission to view this clinical resource with role <strong>{attemptedRole}</strong>.
        </p>
        <div className="error-details">
          <p>
            RecoverTrack strictly separates administrative caregiver controls, patient dose logs, and doctor clinical reviews under Role-Based Access Control (RBAC).
          </p>
        </div>
        <div className="error-actions">
          <Link to={getFallbackRoute()} className="btn btn-primary" id="btn-back-home">
            Return to Authorized Workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
