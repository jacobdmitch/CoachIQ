import axios from 'axios';
import localAdapter from '../local/localAdapter';

const LOCAL_MODE = process.env.REACT_APP_LOCAL_MODE === 'true';
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  // Standalone mode: fulfil every request from on-device storage instead of
  // the network. No other code changes — the screens keep using apiClient.
  ...(LOCAL_MODE ? { adapter: localAdapter } : {}),
});

// ─── Request interceptor — attach the access token ────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor — transparent token refresh on 401 ─────────────────

let _isRefreshing = false;
let _pendingQueue = []; // requests waiting while a refresh is in-flight

function _processQueue(error, token = null) {
  _pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  _pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and only once per request
    if (error.response?.status !== 401 || originalRequest._retried) {
      // Hard-logout on repeated 401 (refresh itself failed)
      if (error.response?.status === 401 && originalRequest._retried) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('activeTeamId');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // If a refresh is already in-flight, queue this request
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _pendingQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retried = true;
    _isRefreshing = true;

    try {
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      const newToken = res.data.token;

      localStorage.setItem('token', newToken);
      apiClient.defaults.headers.common.Authorization = `Bearer ${newToken}`;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      _processQueue(null, newToken);
      return apiClient(originalRequest);
    } catch (refreshError) {
      _processQueue(refreshError, null);
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('activeTeamId');
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  }
);

export default apiClient;
