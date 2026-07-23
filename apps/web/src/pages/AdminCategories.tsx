// ============================================================
// POS Yoga — Admin Categories Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getLocalCategories } from '../lib/offline-db';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export default function AdminCategories() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', icon: '🍔', color: '#ef4444' });

  const qc = useQueryClient();
  const { data: catRes, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        return await api.get<{ data: Category[] }>('/categories');
      } catch {
        const local = await getLocalCategories();
        return { data: local as unknown as Category[] };
      }
    },
  });

  const categories = catRes?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/categories', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori ditambahkan');
      closeForm();
    },
    onError: (e: any) => toast.error(e.message?.includes('fetch') ? 'Tambah kategori membutuhkan koneksi internet ke VPS' : e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/categories/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori diperbarui');
      closeForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori dihapus');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', icon: '🍔', color: '#ef4444' });
    setShowForm(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, icon: c.icon || '🍔', color: c.color || '#ef4444' });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const icons = ['🍔', '☕', '🍿', '🍰', '🍕', '🥗', '🍦', '🍜'];
  const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#06b6d4', '#f97316'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kategori</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Kelola kategori produk</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">
          <Plus size={18} /> Tambah Kategori
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full flex justify-center py-8"><div className="spinner" /></div>
        ) : categories.length === 0 ? (
          <p className="col-span-full text-center py-8 text-[var(--color-text-dim)]">Belum ada kategori</p>
        ) : (
          categories.map((c) => (
            <div key={c.id} className="glass-card p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg"
                  style={{ backgroundColor: `${c.color}15`, border: `1px solid ${c.color}40` }}
                >
                  {c.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-base">{c.name}</h3>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(c)} className="btn btn-ghost btn-icon btn-sm">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => { if (confirm('Hapus kategori ini?')) deleteMutation.mutate(c.id); }}
                  className="btn btn-ghost btn-icon btn-sm text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editing ? 'Edit Kategori' : 'Tambah Kategori'}</h3>
              <button onClick={closeForm} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Kategori</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">Pilih Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {icons.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl border ${form.icon === ic ? 'border-blue-500 bg-blue-500/10' : 'border-[var(--color-border)]'}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">Pilih Warna</label>
                <div className="flex gap-2 flex-wrap">
                  {colors.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setForm({ ...form, color: col })}
                      className="w-8 h-8 rounded-full border-2"
                      style={{ backgroundColor: col, borderColor: form.color === col ? 'white' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={18} className="animate-spin" /> : (editing ? 'Simpan' : 'Tambah')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
