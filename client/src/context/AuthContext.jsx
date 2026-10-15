import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, onUnauthorized, getAuthToken, setAuthToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session from token on mount
  const checkAuth = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch('/auth/me');
      if (res.ok && res.data) {
        const userData = res.data.user || res.data;
        setUser({
          id: userData.id || userData._id,
          name: userData.name,
          role: userData.role,
          email: userData.email,
          linkedPatientProfileId: userData.linkedPatientProfileId,
          accessibleProfileIds: userData.accessibleProfileIds
        });
      } else {
        setAuthToken(null);
        setUser(null);
      }
    } catch (err) {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    // Listen for 401 Unauthorized signals from API client
    const unsubscribe = onUnauthorized(() => {
      setAuthToken(null);
      setUser(null);
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    });

    return () => unsubscribe();
  }, [checkAuth]);

  // Login handler
  const login = async (email, password) => {
    setError(null);
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const errorMsg = res.data?.error || res.data?.message || 'Login failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      if (res.data?.token) {
        setAuthToken(res.data.token);
      }

      const userData = res.data.user || res.data;
      const verifiedUser = {
        id: userData.id || userData._id,
        name: userData.name,
        role: userData.role
      };
      setUser(verifiedUser);
      return { success: true, user: verifiedUser };
    } catch (err) {
      const errorMsg = err.message || 'An unexpected error occurred during login';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  // Register handler
  const register = async (userData) => {
    setError(null);
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });

      if (!res.ok) {
        const errorMsg = res.data?.error || res.data?.message || 'Registration failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      if (res.data?.token) {
        setAuthToken(res.data.token);
      }

      return { success: true, data: res.data };
    } catch (err) {
      const errorMsg = err.message || 'An unexpected error occurred during registration';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setAuthToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
