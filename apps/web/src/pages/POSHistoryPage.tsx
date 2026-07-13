// ============================================================
// POS Yoga — POS History Page (Cashier)
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatTime } from '../lib/utils';
import { Clock, RefreshCw } from 'lucide-react';

interface Transaction {
  id: string;
  invoiceNo: string;
  total: string;
  status: string;
  createdAt: string;
}

export default function POSHistoryPage() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['transactions-today'],
    queryFn: () => api.get<{ data: Transaction[] }>('/transactions/today'),
  });

  const txs = data?.data || [];

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
            <tr><th>Waktu</th><th>Invoice</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : txs.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-[var(--color-text-dim)]">Belum ada transaksi hari ini</td></tr>
            ) : (
              txs.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatTime(tx.createdAt)}</td>
                  <td className="font-mono text-sm font-semibold">{tx.invoiceNo}</td>
                  <td className="font-bold">{formatCurrency(Number(tx.total))}</td>
                  <td>
                    <span className={`badge ${tx.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
