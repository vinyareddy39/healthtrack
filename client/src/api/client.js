export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Registry of 401 listeners (e.g. AuthContext)
let unauthorizedListeners = [];

export function onUnauthorized(callback) {
  unauthorizedListeners.push(callback);
  return () => {
    unauthorizedListeners = unauthorizedListeners.filter(cb => cb !== callback);
  };
}

export function notifyUnauthorized() {
  unauthorizedListeners.forEach(cb => {
    try {
      cb();
    } catch (err) {
      console.error('Error in unauthorized listener:', err);
    }
  });
}

/**
 * Universal fetch wrapper for RecoverTrack API
 * Always sends credentials: 'include' for secure cookie authentication
 * Automatically intercepts 401 responses to clear auth state and redirect to login
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers
  });

  // Intercept 401 responses (except during login check itself where 401 is normal validation error)
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
    notifyUnauthorized();
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (_) {}
  } else {
    data = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}
