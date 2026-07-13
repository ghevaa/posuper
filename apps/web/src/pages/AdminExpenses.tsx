// ============================================================
// POS Yoga — Admin Expenses Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Plus, Trash2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Expense {
  id: string;
  description: string;
  amount: string;
  date: string;
  userId: string;
  createdAt: string;
}

export default function AdminExpenses() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0] });

  const qc = useQueryClient();
  const { data: expRes, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get<{ data: Expense[] }>('/expenses'),
  });

  const expenses = expRes?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Pengeluaran dicatat');
      setShowForm(false);
      setForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Pengeluaran dihapus');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      description: form.description,
      amount: Number(form.amount),
      date: new Date(form.date).toISOString(),
    });
  };

  const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pengeluaran</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Catat biaya operasional toko</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus size={18} /> Catat Pengeluaran
        </button>
      </div>

      {/* Summary card */}
      <div className="stat-card w-72">
        <p className="text-sm text-[var(--color-text-muted)]">Total Pengeluaran Bulan Ini</p>
        <p className="text-2xl font-bold text-red-400 mt-2">{formatCurrency(totalExpense)}</p>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Tanggal</th><th>Deskripsi</th><th>Jumlah</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-[var(--color-text-dim)]">Belum ada pengeluaran</td></tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td className="font-medium">{e.description}</td>
                  <td className="text-red-400 font-semibold">{formatCurrency(Number(e.amount))}</td>
                  <td>
                    <button
                      onClick={() => { if (confirm('Hapus catatan ini?')) deleteMutation.mutate(e.id); }}
                      className="btn btn-ghost btn-icon btn-sm text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Catat Pengeluaran</h3>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Deskripsi</label>
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="e.g. Beli sabun cuci piring, bayar listrik" />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Jumlah (Rupiah)</label>
                <input type="number" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Tanggal</label>
                <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Simpan'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
