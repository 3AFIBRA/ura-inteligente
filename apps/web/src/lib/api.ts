import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { selectEffectiveTenantId, useAuthStore } from '../store/auth';
import type { ApiError } from '../types/api';

export const API_BASE = '/api';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const state = useAuthStore.getState();
  if (state.accessToken) {
    config.headers.Authorization = `Bearer ${state.accessToken}`;
  }
  if (state.user?.role === 'superadmin' && state.selectedTenantId) {
    config.headers['X-Tenant-Id'] = state.selectedTenantId;
  }
  return config;
});

// ---- Refresh automatico com fila de requisicoes ----
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return null;
  }
  try {
    const res = await axios.post<{ accessToken: string; refreshToken: string }>(`${API_BASE}/auth/refresh`, { refreshToken });
    setTokens(res.data);
    return res.data.accessToken;
  } catch {
    logout();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    if (status === 401 && original && !original._retry && !url.includes('/auth/login') && !url.includes('/auth/refresh')) {
      original._retry = true;
      if (!refreshing) {
        refreshing = doRefresh().finally(() => {
          refreshing = null;
        });
      }
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Extrai mensagem legivel de um erro axios/qualquer. */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : String(data.message);
    if (err.code === 'ECONNABORTED') return 'Timeout';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<T>(url, config);
  return res.data;
}
export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.post<T>(url, body, config);
  return res.data;
}
export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.put<T>(url, body);
  return res.data;
}
export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch<T>(url, body);
  return res.data;
}
export async function del<T = void>(url: string): Promise<T> {
  const res = await api.delete<T>(url);
  return res.data;
}

/** URL para streaming de gravacao em <audio>. */
export function recordingStreamUrl(recordingId: string): string {
  const token = useAuthStore.getState().accessToken ?? '';
  return `${API_BASE}/recordings/${recordingId}/stream?token=${encodeURIComponent(token)}`;
}
