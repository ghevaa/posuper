// ============================================================
// POS Yoga — Sync Store & Network Listener
// ============================================================

import { create } from 'zustand';
import { offlineDB } from '../lib/offline-db';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { Network } from '@capacitor/network';

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  initSyncStore: () => () => void;
  updatePendingCount: () => Promise<void>;
  syncPendingTransactions: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: 0,
  isSyncing: false,

  initSyncStore: () => {
    if (typeof window === 'undefined') return () => {};

    // Initial network check via Capacitor Network plugin
    Network.getStatus().then((status) => {
      set({ isOnline: status.connected });
    }).catch(() => {
      set({ isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true });
    });

    // Listen for network changes via Capacitor Network plugin
    const listenerPromise = Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        set({ isOnline: true });
        toast.success('Koneksi internet aktif kembali! Memulai sinkronisasi...', { icon: '🟢' });
        get().syncPendingTransactions();
      } else {
        set({ isOnline: false });
        toast.error('Internet terputus. Mode Offline Aktif', { icon: '🔴', duration: 4000 });
      }
    });

    // Browser fallbacks
    const handleOnline = () => {
      set({ isOnline: true });
      get().syncPendingTransactions();
    };
    const handleOffline = () => {
      set({ isOnline: false });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial count update
    get().updatePendingCount();

    // Auto-sync interval every 30s when online
    const interval = setInterval(() => {
      if (get().isOnline && !get().isSyncing) {
        get().syncPendingTransactions();
      }
    }, 30000);

    return () => {
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  },

  updatePendingCount: async () => {
    try {
      const count = await offlineDB.pendingTransactions.count();
      set({ pendingCount: count });
    } catch {
      set({ pendingCount: 0 });
    }
  },

  syncPendingTransactions: async () => {
    if (get().isSyncing) return;
    try {
      const pendingTxList = await offlineDB.pendingTransactions.toArray();
      if (pendingTxList.length === 0) {
        set({ pendingCount: 0 });
        return;
      }

      set({ isSyncing: true });

      // Send to bulk sync endpoint
      const response = await api.post<{ success: boolean; syncedIds?: string[]; message?: string }>(
        '/transactions/sync-bulk',
        { transactions: pendingTxList }
      );

      if (response.success && response.syncedIds && response.syncedIds.length > 0) {
        // Remove synced items from IndexedDB
        await offlineDB.pendingTransactions.bulkDelete(response.syncedIds);
        await get().updatePendingCount();
        toast.success(`${response.syncedIds.length} transaksi offline berhasil disinkronkan ke VPS!`, { icon: '🚀' });
      }
    } catch (err: any) {
      console.error('Auto sync error:', err);
    } finally {
      set({ isSyncing: false });
      get().updatePendingCount();
    }
  },
}));
