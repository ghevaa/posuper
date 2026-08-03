// ============================================================
// POS Yoga — POS History Page (Cashier)
// ============================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatTime } from '../lib/utils';
import { Clock, RefreshCw, Printer, Eye, X, Loader2 } from 'lucide-react';
import { printTransactionReceipt } from '../lib/reprint-helper';
import { useAuthStore } from '../stores/auth.store';
import toast from 'react-hot-toast';

interface Transaction {
  id: string;
  invoiceNo: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paidAmount: string;
  changeAmount: string;
  paymentMethod: string;
  orderType: string;
  tableNo?: string;
  status: string;
  createdAt: string;
  items?: any[];
}

export default function POSHistoryPage() {
  const { user } = useAuthStore();
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['transactions-today'],
    queryFn: () => api.get<{ data: Transaction[] }>('/transactions/today'),
  });

  const txs = data?.data || [];

  const handleReprint = async (txId: string) => {
    setPrintingId(txId);
    try {
      const res = await api.get<{ data: any }>(`/transactions/${txId}`);
      await printTransactionReceipt(res.data, user?.name || 'Kasir');
    } catch (err: any) {
      toast.error('Gagal memuat detail transaksi');
    } finally {
      setPrintingId(null);
    }
  };

  const handleOpenDetail = async (txId: string) => {
    try {
      const res = await api.get<{ data: any }>(`/transactions/${txId}`);
      setSelectedTx(res.data);
    } catch (err: any) {
      toast.error('Gagal memuat detail transaksi');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="text-blue-500" />
            Riwayat Hari Ini
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Transaksi kasir Anda hari ini</p>
        </div>
        <button onClick={() => refetch()} className="btn btn-secondary flex items-center gap-2" disabled={isRefetching}>
          <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Invoice</th>
              <th>Metode</th>
              <th>Tipe</th>
              <th>Total</th>
              <th>Status</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : txs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-dim)]">Belum ada transaksi hari ini</td></tr>
            ) : (
              txs.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatTime(tx.createdAt)}</td>
                  <td className="font-mono text-sm font-semibold">{tx.invoiceNo}</td>
                  <td>
                    <span className="badge badge-info text-xs font-bold uppercase">
                      {tx.paymentMethod || 'cash'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${tx.orderType === 'take_away' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'} text-xs font-bold`}>
                      {tx.orderType === 'take_away' ? 'Take Away' : `Dine In ${tx.tableNo ? `(Meja ${tx.tableNo})` : ''}`}
                    </span>
                  </td>
                  <td className="font-bold">{formatCurrency(Number(tx.total))}</td>
                  <td>
                    <span className={`badge ${tx.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                      {tx.status === 'completed' ? 'Lunas' : tx.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleOpenDetail(tx.id)}
                        className="btn btn-ghost btn-icon btn-sm text-blue-400"
                        title="Lihat Detail"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleReprint(tx.id)}
                        disabled={printingId === tx.id}
                        className="btn btn-secondary btn-sm gap-1 text-xs font-bold"
                        title="Cetak Ulang Struk"
                      >
                        {printingId === tx.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                        Cetak Struk
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="modal-overlay" onClick={() => setSelectedTx(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">{selectedTx.invoiceNo}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {new Date(selectedTx.createdAt).toLocaleString('id-ID')} • {selectedTx.orderType === 'take_away' ? 'Take Away' : `Dine In ${selectedTx.tableNo ? `(Meja ${selectedTx.tableNo})` : ''}`}
                </p>
              </div>
              <button onClick={() => setSelectedTx(null)} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>

            <div className="space-y-2 mb-4 border-t border-[var(--color-border)] pt-3 max-h-60 overflow-y-auto">
              {selectedTx.items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <div>
                    <span className="font-semibold">{item.productName}</span>
                    {item.variantName && <span className="text-[var(--color-text-muted)]"> ({item.variantName})</span>}
                    <div className="text-[10px] text-[var(--color-text-dim)]">{item.qty}x @ {formatCurrency(Number(item.price))}</div>
                  </div>
                  <span className="font-bold">{formatCurrency(Number(item.subtotal))}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--color-border)] pt-3 space-y-1 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(Number(selectedTx.subtotal))}</span></div>
              {Number(selectedTx.discount) > 0 && (
                <div className="flex justify-between text-emerald-400"><span>Diskon</span><span>-{formatCurrency(Number(selectedTx.discount))}</span></div>
              )}
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-[var(--color-border)]">
                <span>Total</span>
                <span className="gradient-text">{formatCurrency(Number(selectedTx.total))}</span>
              </div>
              <div className="flex justify-between"><span>Bayar ({selectedTx.paymentMethod?.toUpperCase()})</span><span>{formatCurrency(Number(selectedTx.paidAmount))}</span></div>
              <div className="flex justify-between text-green-400"><span>Kembalian</span><span>{formatCurrency(Number(selectedTx.changeAmount))}</span></div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--color-border)] flex gap-2">
              <button
                onClick={() => printTransactionReceipt(selectedTx, user?.name || 'Kasir')}
                className="btn btn-primary w-full gap-2 font-bold"
              >
                <Printer size={18} />
                Cetak Ulang Struk (Printer Thermal)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
