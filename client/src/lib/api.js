import axios from 'axios';

const TOKEN_KEY = 'propbot_token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) onUnauthorized();
    return Promise.reject(err);
  }
);

export const errorMessage = (err, fallback = 'Something went wrong') => {
  const d = err?.response?.data;
  if (d?.details && Array.isArray(d.details)) return `${d.error}: ${d.details.join(', ')}`;
  return d?.error || (err?.code === 'ECONNABORTED' ? 'Request timed out' : err?.message) || fallback;
};

/** Downloads a file from an authenticated endpoint. */
export async function downloadFile(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
