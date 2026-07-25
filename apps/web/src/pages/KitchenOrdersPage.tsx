// ============================================================
// POS Yoga — Kitchen Orders Page (Dapur)
// Statuses: 'pending' (Belum Diproses), 'processing' (Sedang Dimasak), 'completed' (Pesanan Selesai)
// ============================================================

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatTime } from '../lib/utils';
import {
  Printer, RefreshCw, ChefHat, Clock, CheckCircle2, Loader2, Copy, Flame, Share2, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isBLESupported, printKitchenTicket,
} from '../lib/bluetooth-printer';
import { generateKitchenTicketText } from '../lib/receipt-text';
import { Capacitor } from '@capacitor/core';

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  qty: number;
}

interface KitchenOrder {
  id: string;
  invoiceNo: string;
  createdAt: string;
  kitchenStatus?: 'pending' | 'processing' | 'completed';
  items: OrderItem[];
}

export default function KitchenOrdersPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');
  const [printing, setPrinting] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['kitchen-orders'],
    queryFn: () => api.get<{ data: KitchenOrder[] }>('/transactions/today-all'),
    refetchInterval: 15000, // Auto-refresh 15 seconds
  });

  const orders = data?.data || [];

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: string; kitchenStatus: 'pending' | 'processing' | 'completed' }) =>
      api.patch(`/transactions/${id}/kitchen-status`, { kitchenStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
      toast.success('Status dapur diperbarui');
    },
    onError: (err: any) => toast.error(err.message || 'Gagal memperbarui status'),
  });

  // Count by status
  const pendingOrders = orders.filter(o => !o.kitchenStatus || o.kitchenStatus === 'pending');
  const processingOrders = orders.filter(o => o.kitchenStatus === 'processing');
  const completedOrders = orders.filter(o => o.kitchenStatus === 'completed');

  // Filtered list
  const filteredOrders = orders.filter(o => {
    const status = o.kitchenStatus || 'pending';
    if (activeTab === 'all') return true;
    return status === activeTab;
  });

  // Beep sound on new pending order
  useEffect(() => {
    if (pendingOrders.length > 0) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch { /* ignore */ }
    }
  }, [pendingOrders.length]);

  const handlePrint = async (order: KitchenOrder) => {
    setPrinting(order.id);
    try {
      const IS_CAPACITOR = Capacitor.isNativePlatform();
      const hasBLE = isBLESupported();

      if (hasBLE && !IS_CAPACITOR) {
        await printKitchenTicket({
          invoiceNo: order.invoiceNo,
          cashierName: '',
          items: order.items.map(i => ({
            name: i.productName,
            qty: i.qty,
            price: 0,
            variantName: i.variantName,
          })),
          date: new Date(order.createdAt),
          paperSize: '58mm',
        });
        toast.success('Nota dapur berhasil dicetak!');
      } else {
        const text = generateKitchenTicketText({
          invoiceNo: order.invoiceNo,
          items: order.items,
          date: new Date(order.createdAt),
        });

        // Try Web Share API (opens RawBT or Bluetooth Printer app on Android!)
        if (navigator.share) {
          try {
            await navigator.share({
              title: `Nota Dapur ${order.invoiceNo}`,
              text: text,
            });
            toast.success('Nota dikirim ke printer/app!', { icon: '🖨️' });
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              await navigator.clipboard.writeText(text);
              toast.success('Nota disalin ke clipboard!', { icon: '📋' });
            }
          }
        } else {
          await navigator.clipboard.writeText(text);
          toast.success('Nota disalin ke clipboard!', { icon: '📋' });
        }
      }
    } catch (err: any) {
      console.error('Print error:', err);
      try {
        const text = generateKitchenTicketText({
          invoiceNo: order.invoiceNo,
          items: order.items,
          date: new Date(order.createdAt),
        });
        await navigator.clipboard.writeText(text);
        toast.success('Nota disalin ke clipboard', { icon: '📋' });
      } catch {
        toast.error(err.message || 'Gagal mencetak nota dapur');
      }
    } finally {
      setPrinting(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'processing':
        return <span className="badge badge-info flex items-center gap-1 text-xs"><Flame size={12} /> Sedang Dimasak</span>;
      case 'completed':
        return <span className="badge badge-success flex items-center gap-1 text-xs"><CheckCircle2 size={12} /> Selesai</span>;
      default:
        return <span className="badge badge-warning flex items-center gap-1 text-xs"><Clock size={12} /> Belum Diproses</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ChefHat className="text-orange-400" /> Pesanan Dapur
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
            Status masak real-time • Auto-refresh 15 detik
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm" disabled={isRefetching}>
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`stat-card !p-3 text-left transition-all ${activeTab === 'all' ? 'border-[var(--color-primary-500)] bg-[var(--color-surface-lighter)]' : ''}`}
        >
          <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Semua</p>
          <p className="text-xl sm:text-2xl font-bold mt-0.5">{orders.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`stat-card !p-3 text-left transition-all ${activeTab === 'pending' ? 'border-amber-500 bg-amber-500/10' : ''}`}
        >
          <p className="text-[10px] text-amber-400 uppercase tracking-wider truncate">Belum Diproses</p>
          <p className="text-xl sm:text-2xl font-bold text-amber-400 mt-0.5">{pendingOrders.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('processing')}
          className={`stat-card !p-3 text-left transition-all ${activeTab === 'processing' ? 'border-blue-500 bg-blue-500/10' : ''}`}
        >
          <p className="text-[10px] text-blue-400 uppercase tracking-wider truncate">Sedang Dimasak</p>
          <p className="text-xl sm:text-2xl font-bold text-blue-400 mt-0.5">{processingOrders.length}</p>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`stat-card !p-3 text-left transition-all ${activeTab === 'completed' ? 'border-emerald-500 bg-emerald-500/10' : ''}`}
        >
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider truncate">Selesai</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-400 mt-0.5">{completedOrders.length}</p>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ChefHat size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-[var(--color-text-dim)]">Tidak ada pesanan pada kategori ini</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">Pesanan baru akan muncul otomatis</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredOrders.map(order => {
            const status = order.kitchenStatus || 'pending';
            return (
              <div
                key={order.id}
                className={`glass-card p-4 flex flex-col justify-between border-l-4 transition-all ${
                  status === 'pending'
                    ? 'border-l-amber-500'
                    : status === 'processing'
                    ? 'border-l-blue-500 bg-blue-500/5'
                    : 'border-l-emerald-500 opacity-75'
                }`}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-[var(--color-primary-400)]">
                      {order.invoiceNo}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      {formatTime(order.createdAt)}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="mb-3">
                    {getStatusBadge(status)}
                  </div>

                  {/* Items List (NO PRICES) */}
                  <div className="space-y-1.5 mb-4">
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className={`font-bold text-xs px-1.5 py-0.5 rounded min-w-[28px] text-center ${
                          status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300'
                            : status === 'processing'
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {item.qty}x
                        </span>
                        <span className="text-sm font-medium">
                          {item.productName}
                          {item.variantName && (
                            <span className="text-[var(--color-text-dim)] text-xs ml-1">({item.variantName})</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
                  {/* Primary Status Button */}
                  {status === 'pending' && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: order.id, kitchenStatus: 'processing' })}
                      disabled={updateStatusMutation.isPending}
                      className="btn btn-warning w-full text-xs font-semibold py-2"
                    >
                      <Flame size={14} /> Mulai Dimasak
                    </button>
                  )}

                  {status === 'processing' && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: order.id, kitchenStatus: 'completed' })}
                      disabled={updateStatusMutation.isPending}
                      className="btn btn-success w-full text-xs font-semibold py-2"
                    >
                      <CheckCircle2 size={14} /> Pesanan Selesai
                    </button>
                  )}

                  {status === 'completed' && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: order.id, kitchenStatus: 'processing' })}
                      disabled={updateStatusMutation.isPending}
                      className="btn btn-secondary w-full text-xs py-1.5 text-[var(--color-text-dim)]"
                    >
                      Kembalikan ke Proses
                    </button>
                  )}

                  {/* Print & Share Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrint(order)}
                      disabled={printing === order.id}
                      className="btn btn-secondary btn-sm flex-1 text-xs"
                    >
                      {printing === order.id ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                      Cetak Nota Dapur
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
