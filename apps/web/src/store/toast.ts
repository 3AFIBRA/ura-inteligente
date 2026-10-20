import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 7000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ kind: 'info', title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ kind: 'warning', title, description }),
};
