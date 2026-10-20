import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserDto } from '../types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserDto | null;
  /** tenant selecionado pelo superadmin (null = nenhum) */
  selectedTenantId: string | null;
  setSession: (tokens: { accessToken: string; refreshToken: string }, user: UserDto) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setUser: (user: UserDto) => void;
  setSelectedTenant: (tenantId: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      selectedTenantId: null,
      setSession: (tokens, user) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          selectedTenantId: user.role === 'superadmin' ? null : user.tenantId,
        }),
      setTokens: (tokens) => set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      setUser: (user) => set({ user }),
      setSelectedTenant: (tenantId) => set({ selectedTenantId: tenantId }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, selectedTenantId: null }),
    }),
    { name: 'ura.auth' },
  ),
);

/** Tenant efetivo para consultas: tenant do usuario ou o selecionado pelo superadmin. */
export function selectEffectiveTenantId(s: AuthState): string | null {
  if (!s.user) return null;
  return s.user.role === 'superadmin' ? s.selectedTenantId : s.user.tenantId;
}
