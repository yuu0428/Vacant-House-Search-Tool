import { create } from 'zustand'

export type ToastKind = 'info' | 'error'

export interface ToastMessage {
  id: string
  message: string
  kind: ToastKind
}

interface ToastStore {
  items: ToastMessage[]
  push(message: Omit<ToastMessage, 'id'>): void
  dismiss(id: string): void
  clear(): void
}

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (message) =>
    set((state) => ({
      items: [
        ...state.items,
        { ...message, id: crypto.randomUUID() },
      ],
    })),
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}))
