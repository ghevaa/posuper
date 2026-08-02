// ============================================================
// POS Yoga — Admin Transactions Page
// ============================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { Eye, X, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminTransactions() {
  const [detail, setDetail] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.get<{ data: any[] }>('/transactions'),
  });

  const transactions = data?.data || [];

  const openDetail = async (id: string) => {
    const res = await api.get<{ data: any }>(`/transactions/${id}`);
    setDetail(res.data);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await api.downloadFile('/export/transactions', `transaksi_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('File Excel transaksi berhasil diunduh!');
    } catch (err: any) {
      toast.error(err.message || 'Gagal export data transaksi');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transaksi</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Riwayat transaksi & detail penjualan</p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={exporting}
          className="btn btn-primary gap-2 font-bold"
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Export Excel Transaksi
        </button>
      </div>
      <div className="table-container">
        <table>
          <thead><tr><th>Invoice</th><th>Tanggal</th><th>Total</th><th>Bayar</th><th>Kembalian</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : transactions.map((tx: any) => (
              <tr key={tx.id}>
                <td className="font-mono text-sm">{tx.invoiceNo}</td>
                <td className="text-[var(--color-text-muted)]">{formatDateTime(tx.createdAt)}</td>
                <td className="font-semibold">{formatCurrency(Number(tx.total))}</td>
                <td>{formatCurrency(Number(tx.paidAmount))}</td>
                <td className="text-green-400">{formatCurrency(Number(tx.changeAmount))}</td>
                <td><span className={`badge ${tx.status === 'completed' ? 'badge-success' : tx.status === 'voided' ? 'badge-danger' : 'badge-warning'}`}>{tx.status}</span></td>
                <td><button onClick={() => openDetail(tx.id)} className="btn btn-ghost btn-icon btn-sm"><Eye size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{detail.invoiceNo}</h3>
              <button onClick={() => setDetail(null)} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <div className="space-y-2 mb-4">
              {detail.items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.productName} x{item.qty}</span>
                  <span>{formatCurrency(Number(item.subtotal))}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--color-border)] pt-3 space-y-1">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCurrency(Number(detail.subtotal))}</span></div>
              <div className="flex justify-between text-sm"><span>Diskon</span><span>-{formatCurrency(Number(detail.discount))}</span></div>
              <div className="flex justify-between text-sm"><span>Pajak</span><span>{formatCurrency(Number(detail.tax))}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2"><span>Total</span><span className="gradient-text">{formatCurrency(Number(detail.total))}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
