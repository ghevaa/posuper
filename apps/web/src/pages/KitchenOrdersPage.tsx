// ============================================================
// POS Yoga — Kitchen Orders Page (Dapur)
// ============================================================

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatTime } from '../lib/utils';
import { Printer, RefreshCw, ChefHat, Clock, CheckCircle2, Loader2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isBLESupported, isPrinterConnected, printKitchenTicket,
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
  items: OrderItem[];
}

export default function KitchenOrdersPage() {
  const [printedIds, setPrintedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('kitchen_printed_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [printing, setPrinting] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['kitchen-orders'],
    queryFn: () => api.get<{ data: KitchenOrder[] }>('/transactions/today-all'),
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });

  const orders = data?.data || [];
  const newOrders = orders.filter(o => !printedIds.has(o.id));
  const printedOrders = orders.filter(o => printedIds.has(o.id));

  // Save printed IDs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('kitchen_printed_ids', JSON.stringify([...printedIds]));
    } catch { /* ignore */ }
  }, [printedIds]);

  // Play notification sound for new orders
  useEffect(() => {
    if (newOrders.length > 0) {
      // Simple beep notification
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
  }, [newOrders.length]);

  const handlePrint = async (order: KitchenOrder) => {
    setPrinting(order.id);
    try {
      const IS_CAPACITOR = Capacitor.isNativePlatform();
      const hasBLE = isBLESupported();

      if (hasBLE && !IS_CAPACITOR) {
        // Desktop (Tauri/Chrome) - use Bluetooth
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
        // Mobile (Capacitor) or no BLE - copy to clipboard
        const text = generateKitchenTicketText({
          invoiceNo: order.invoiceNo,
          items: order.items,
          date: new Date(order.createdAt),
        });
        await navigator.clipboard.writeText(text);
        toast.success('Nota dapur disalin ke clipboard!', { icon: '📋' });
      }

      // Mark as printed
      setPrintedIds(prev => new Set([...prev, order.id]));
    } catch (err: any) {
      console.error('Print error:', err);
      // Fallback: copy to clipboard
      try {
        const text = generateKitchenTicketText({
          invoiceNo: order.invoiceNo,
          items: order.items,
          date: new Date(order.createdAt),
        });
        await navigator.clipboard.writeText(text);
        toast.success('Gagal cetak, nota disalin ke clipboard', { icon: '📋' });
        setPrintedIds(prev => new Set([...prev, order.id]));
      } catch {
        toast.error(err.message || 'Gagal mencetak nota dapur');
      }
    } finally {
      setPrinting(null);
    }
  };

  const handleCopyText = async (order: KitchenOrder) => {
    const text = generateKitchenTicketText({
      invoiceNo: order.invoiceNo,
      items: order.items,
      date: new Date(order.createdAt),
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Nota disalin ke clipboard!', { icon: '📋' });
    } catch {
      toast.error('Gagal menyalin');
    }
  };

  const clearPrintHistory = () => {
    setPrintedIds(new Set());
    localStorage.removeItem('kitchen_printed_ids');
    toast.success('Riwayat cetak direset');
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
            Pesanan masuk hari ini • Auto-refresh 15 detik
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm" disabled={isRefetching}>
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          {printedIds.size > 0 && (
            <button onClick={clearPrintHistory} className="btn btn-ghost btn-sm text-xs">
              Reset Riwayat
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="stat-card flex-1 !p-3">
          <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Pesanan Baru</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{newOrders.length}</p>
        </div>
        <div className="stat-card flex-1 !p-3">
          <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Sudah Dicetak</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{printedOrders.length}</p>
        </div>
        <div className="stat-card flex-1 !p-3">
          <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Total Hari Ini</p>
          <p className="text-2xl font-bold mt-1">{orders.length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ChefHat size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-[var(--color-text-dim)]">Belum ada pesanan hari ini</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">Pesanan baru akan muncul otomatis</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* New Orders */}
          {newOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
                <Clock size={14} /> Pesanan Baru ({newOrders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {newOrders.map(order => (
                  <div key={order.id} className="glass-card p-4 border-l-4 border-l-orange-500 animate-pulse-once">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-orange-400">{order.invoiceNo}</span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        {formatTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="space-y-1.5 mb-4">
                      {order.items.map(item => (
                        <div key={item.id} className="flex items-start gap-2">
                          <span className="bg-orange-500/20 text-orange-300 font-bold text-xs px-1.5 py-0.5 rounded min-w-[28px] text-center">
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrint(order)}
                        disabled={printing === order.id}
                        className="btn btn-primary btn-sm flex-1 text-xs"
                      >
                        {printing === order.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                        Cetak Nota Dapur
                      </button>
                      <button
                        onClick={() => handleCopyText(order)}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Salin teks"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Printed Orders */}
          {printedOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                <CheckCircle2 size={14} /> Sudah Dicetak ({printedOrders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {printedOrders.map(order => (
                  <div key={order.id} className="glass-card p-4 opacity-60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs font-bold text-emerald-400">{order.invoiceNo}</span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        {formatTime(order.createdAt)}
                      </span>
                    </div>
                    <div className="space-y-1 mb-3">
                      {order.items.map(item => (
                        <div key={item.id} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold text-xs min-w-[28px] text-center">
                            {item.qty}x
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {item.productName}
                            {item.variantName && ` (${item.variantName})`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handlePrint(order)}
                      disabled={printing === order.id}
                      className="btn btn-ghost btn-sm w-full text-xs"
                    >
                      {printing === order.id ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                      Cetak Ulang
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
