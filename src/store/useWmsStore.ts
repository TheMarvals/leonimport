import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface OutboxItem {
  id: string;
  action: 'PICK_ITEM' | 'PACK_ITEM';
  payload: Record<string, unknown>;
  timestamp: number;
}

interface WmsState {
  // Identity
  userId: string | null;
  currentOrderId: string | null;
  currentMlId: string | null;

  // Outbox
  outbox: OutboxItem[];
  isOffline: boolean;
  hasSyncConflict: boolean;
  conflictMessage: string | null;

  // Actions
  setUser: (userId: string) => void;
  setOrder: (orderId: string, mlId: string) => void;
  clearOrder: () => void;
  addToOutbox: (action: OutboxItem['action'], payload: Record<string, unknown>) => void;
  syncOutbox: () => Promise<void>;
  setOfflineStatus: (status: boolean) => void;
  clearConflict: () => void;
}

/**
 * WmsStore — Gestión de estado con Outbox Pattern para resiliencia en bodega.
 * 
 * Corrige:
 * - Envía userId en cada sincronización.
 * - Maneja 409 (Conflict) mostrando alerta y limpiando la cola.
 * - Persiste userId y orderId para sobrevivir refrescos de página.
 */
export const useWmsStore = create<WmsState>()(
  persist(
    (set, get) => ({
      userId: null,
      currentOrderId: null,
      currentMlId: null,
      outbox: [],
      isOffline: false,
      hasSyncConflict: false,
      conflictMessage: null,

      setUser: (userId) => set({ userId }),

      setOrder: (orderId, mlId) => set({ currentOrderId: orderId, currentMlId: mlId }),

      clearOrder: () => set({ currentOrderId: null, currentMlId: null, outbox: [] }),

      clearConflict: () => set({ hasSyncConflict: false, conflictMessage: null }),

      addToOutbox: (action, payload) => {
        const { userId, currentMlId } = get();
        if (!userId || !currentMlId) {
          console.error('Cannot add to outbox without userId and mlId');
          return;
        }

        const newItem: OutboxItem = {
          id: crypto.randomUUID(),
          action,
          payload: { ...payload, mlId: currentMlId },
          timestamp: Date.now(),
        };
        set((state) => ({ outbox: [...state.outbox, newItem] }));

        // Intentar sincronizar inmediatamente si estamos online
        if (!get().isOffline) {
          get().syncOutbox();
        }
      },

      setOfflineStatus: (status) => set({ isOffline: status }),

      syncOutbox: async () => {
        const { outbox, isOffline, userId } = get();
        if (isOffline || outbox.length === 0 || !userId) return;

        const itemsToSync = [...outbox];

        for (const item of itemsToSync) {
          try {
            const response = await fetch('/api/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: item.action,
                payload: item.payload,
                userId,
              }),
            });

            if (response.ok) {
              set((state) => ({
                outbox: state.outbox.filter((i) => i.id !== item.id),
              }));
            } else if (response.status === 409) {
              // Lock perdido: el trabajo fue rescatado en SyncConflict por el servidor
              const data = await response.json();
              set({
                hasSyncConflict: true,
                conflictMessage: data.message || 'Lock expirado. Trabajo guardado para revisión.',
                outbox: [], // Limpiar cola — el servidor ya guardó el payload
              });
              break; // No seguir intentando
            }
          } catch {
            set({ isOffline: true });
            break;
          }
        }
      },
    }),
    {
      name: 'wms-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        outbox: state.outbox,
        userId: state.userId,
        currentOrderId: state.currentOrderId,
        currentMlId: state.currentMlId,
      }),
    },
  ),
);
