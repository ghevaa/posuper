// ============================================================
// POS Yoga — Admin Products Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: string; cost: string; stock: number; image: string | null;
  categoryId: string | null; isActive: boolean;
}
interface Category { id: string; name: string; }

export default function AdminProducts() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', price: '', cost: '', stock: '', barcode: '', sku: '', categoryId: '' });

  const qc = useQueryClient();
  const { data: productsRes, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => api.get<{ data: Product[] }>('/products') });
  const { data: catRes } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ data: Category[] }>('/categories') });

  const products = productsRes?.data || [];
  const categories = catRes?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk ditambahkan'); closeForm(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/products/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk diperbarui'); closeForm(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk dihapus'); },
  });

  const openCreate = () => { setEditing(null); setForm({ name: '', price: '', cost: '', stock: '', barcode: '', sku: '', categoryId: '' }); setShowForm(true); };
  const openEdit = (p: Product) => { setEditing(p); setForm({ name: p.name, price: p.price, cost: p.cost, stock: String(p.stock), barcode: p.barcode || '', sku: p.sku || '', categoryId: p.categoryId || '' }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock), categoryId: form.categoryId || null };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Produk</h1><p className="text-sm text-[var(--color-text-muted)]">Kelola daftar produk</p></div>
        <button onClick={openCreate} className="btn btn-primary"><Plus size={18} /> Tambah Produk</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Nama</th><th>Barcode</th><th>Harga</th><th>Modal</th><th>Stok</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-dim)]">Belum ada produk</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-[var(--color-text-muted)]">{p.barcode || '-'}</td>
                  <td>{formatCurrency(Number(p.price))}</td>
                  <td className="text-[var(--color-text-dim)]">{formatCurrency(Number(p.cost))}</td>
                  <td><span className={p.stock < 10 ? 'text-red-400 font-semibold' : ''}>{p.stock}</span></td>
                  <td><span className={`badge ${p.isActive ? 'badge-success' : 'badge-danger'}`}>{p.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="btn btn-ghost btn-icon btn-sm"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Hapus produk ini?')) deleteMutation.mutate(p.id); }} className="btn btn-ghost btn-icon btn-sm text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editing ? 'Edit Produk' : 'Tambah Produk'}</h3>
              <button onClick={closeForm} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Harga Jual</label><input type="number" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></div>
                <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Harga Modal</label><input type="number" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Stok</label><input type="number" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Barcode</label><input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Kategori</label>
                <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Tanpa kategori</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
