import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SchedulePage from './pages/SchedulePage';
import DoctorOverviewPage from './pages/DoctorOverviewPage';
import NotAuthorizedPage from './pages/NotAuthorizedPage';

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p className="loading-text">Loading RecoverTrack workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'caregiver') return <Navigate to="/dashboard" replace />;
  if (user.role === 'patient') return <Navigate to="/my-schedule" replace />;
  if (user.role === 'doctor') return <Navigate to="/patient-overview" replace />;

  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-layout">
          <Header />
          <main className="main-content">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/not-authorized" element={<NotAuthorizedPage />} />

              {/* Protected Caregiver Route */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['caregiver']}>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Protected Patient Route */}
              <Route
                path="/my-schedule"
                element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <SchedulePage />
                  </ProtectedRoute>
                }
              />

              {/* Protected Doctor Route */}
              <Route
                path="/patient-overview"
                element={
                  <ProtectedRoute allowedRoles={['doctor']}>
                    <DoctorOverviewPage />
                  </ProtectedRoute>
                }
              />

              {/* Default Index Fallback */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
