// ============================================================
// POS Yoga — Dev Settings Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Save, Loader2, Printer, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DevSettings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<{ data: Record<string, string> }>('/settings');
      setForm(res.data);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Pengaturan disimpan');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const { data: printersRes } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.get<{ data: any[] }>('/printers'),
  });

  const printers = printersRes?.data || [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="text-purple-500" />
          Pengaturan
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Ubah pengaturan umum toko & printer</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* General Config Form */}
          <form onSubmit={handleSubmit} className="md:col-span-2 glass-card p-6 space-y-4">
            <h3 className="font-bold text-base border-b border-[var(--color-border)] pb-2">Informasi Toko</h3>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Toko</label>
              <input
                className="input"
                value={form.store_name || ''}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Alamat Toko</label>
              <textarea
                className="input"
                value={form.store_address || ''}
                onChange={(e) => setForm({ ...form, store_address: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">No. Telepon</label>
              <input
                className="input"
                value={form.store_phone || ''}
                onChange={(e) => setForm({ ...form, store_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Header Struk</label>
              <input
                className="input"
                value={form.receipt_header || ''}
                onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Footer Struk</label>
              <input
                className="input"
                value={form.receipt_footer || ''}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 size={18} className="animate-spin" /> : (
                <>
                  <Save size={16} />
                  Simpan Pengaturan
                </>
              )}
            </button>
          </form>

          {/* Printer Config */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-bold text-base border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <Printer size={18} />
              Daftar Printer
            </h3>
            <div className="space-y-3">
              {printers.map((p) => (
                <div key={p.id} className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] capitalize">{p.type} Printer</p>
                  </div>
                  <span className={`badge ${p.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {p.isActive ? 'Aktif' : 'Off'}
                  </span>
                </div>
              ))}
              {printers.length === 0 && (
                <p className="text-xs text-[var(--color-text-dim)] text-center py-4">Belum ada printer terdaftar</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
