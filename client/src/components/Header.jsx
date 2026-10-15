import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'caregiver': return 'badge-caregiver';
      case 'doctor': return 'badge-doctor';
      case 'patient': return 'badge-patient';
      default: return 'badge-default';
    }
  };

  const getHomeRoute = () => {
    if (!user) return '/login';
    if (user.role === 'caregiver') return '/dashboard';
    if (user.role === 'patient') return '/my-schedule';
    if (user.role === 'doctor') return '/patient-overview';
    return '/';
  };

  return (
    <header className="app-header">
      <div className="header-container">
        <Link to={getHomeRoute()} className="brand-logo">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">RecoverTrack</span>
            <span className="brand-tagline">Post-Op Adherence</span>
          </div>
        </Link>

        <nav className="header-nav">
          {user ? (
            <div className="user-profile-section">
              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                  {user.role ? user.role.toUpperCase() : 'USER'}
                </span>
              </div>
              <button 
                onClick={logout} 
                className="btn btn-logout"
                title="Log out of RecoverTrack"
                id="btn-logout"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="guest-nav">
              <Link to="/login" className="btn btn-secondary" id="nav-link-login">
                Sign In
              </Link>
              <Link to="/register" className="btn btn-primary" id="nav-link-register">
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
