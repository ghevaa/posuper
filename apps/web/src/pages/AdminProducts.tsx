// ============================================================
// POS Yoga — Admin Products Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, getProductImageUrl } from '../lib/utils';
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getLocalProducts, getLocalCategories, cacheProductsAndCategories } from '../lib/offline-db';

interface ProductVariant {
  id?: string;
  name: string;
  additionalPrice: string;
}

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: string; cost: string; stock: number; image: string | null;
  categoryId: string | null; isActive: boolean;
  variants?: ProductVariant[];
}
interface Category { id: string; name: string; }

export default function AdminProducts() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', price: '', cost: '', stock: '', barcode: '', sku: '', categoryId: '', image: '' });
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Berkas terlalu besar! Maksimal 5MB.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    const toastId = toast.loading('Mengunggah gambar...');
    try {
      const token = localStorage.getItem('pos_yoga_session_token');
      const IS_TAURI = !!(window as any).__TAURI_INTERNALS__;
      const BASE_URL = IS_TAURI ? 'http://72.61.214.92:8080' : '';

      const res = await fetch(`${BASE_URL}/api/products/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Gagal mengunggah gambar');
      }

      const result = await res.json();
      if (result.success && result.data?.url) {
        setForm({ ...form, image: result.data.url });
        toast.success('Gambar berhasil diunggah!', { id: toastId });
      } else {
        throw new Error(result.error || 'Respon gagal');
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah gambar', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const qc = useQueryClient();
  const { data: productsRes, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: Product[] }>('/products');
        if (res.data) {
          cacheProductsAndCategories(res.data as any, catRes?.data as any || []);
        }
        return res;
      } catch {
        const local = await getLocalProducts();
        return { data: local as unknown as Product[] };
      }
    },
  });

  const { data: catRes } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: Category[] }>('/categories');
        return res;
      } catch {
        const local = await getLocalCategories();
        return { data: local as unknown as Category[] };
      }
    },
  });

  const products = productsRes?.data || [];
  const categories = catRes?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk ditambahkan'); closeForm(); },
    onError: (e: any) => toast.error(e.message?.includes('fetch') ? 'Tambah produk membutuhkan koneksi internet ke VPS' : e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/products/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk diperbarui'); closeForm(); },
    onError: (e: any) => toast.error(e.message?.includes('fetch') ? 'Edit produk membutuhkan koneksi internet ke VPS' : e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produk dihapus'); },
    onError: (e: any) => toast.error(e.message?.includes('fetch') ? 'Hapus produk membutuhkan koneksi internet ke VPS' : e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', price: '', cost: '', stock: '', barcode: '', sku: '', categoryId: '', image: '' });
    setVariants([]);
    setShowForm(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, price: p.price, cost: p.cost, stock: String(p.stock), barcode: p.barcode || '', sku: p.sku || '', categoryId: p.categoryId || '', image: p.image || '' });
    setVariants(p.variants ? p.variants.map((v) => ({ id: v.id, name: v.name, additionalPrice: String(Number(v.additionalPrice)) })) : []);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setVariants([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      categoryId: form.categoryId || null,
      image: form.image || null,
      variants: variants.map((v) => ({
        name: v.name,
        additionalPrice: Number(v.additionalPrice || 0)
      }))
    };
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
                  <td className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[var(--color-surface)] flex items-center justify-center text-base overflow-hidden border border-[var(--color-border)] shrink-0">
                        {p.image ? (
                          <img src={getProductImageUrl(p.image)} alt={p.name} className="w-full h-full object-cover" />
                        ) : '📦'}
                      </div>
                      <span>{p.name}</span>
                    </div>
                  </td>
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
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Gambar Produk (URL atau Unggah Lokal)</label>
                <div className="flex gap-2">
                  <input
                    placeholder="https://example.com/gambar.jpg atau unggah berkas..."
                    className="input flex-grow text-xs"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                  />
                  <label className="btn btn-secondary cursor-pointer flex items-center justify-center shrink-0 text-xs py-1 px-3">
                    Unggah
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[var(--color-text-muted)]">Varian / Submenu (Opsional)</label>
                  <button
                    type="button"
                    onClick={() => setVariants([...variants, { name: '', additionalPrice: '0' }])}
                    className="btn btn-secondary btn-sm py-1 px-2 text-xs"
                  >
                    + Tambah Varian
                  </button>
                </div>
                
                {variants.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                    {variants.map((v, i) => (
                      <div key={i} className="flex gap-2 items-center w-full">
                        <input
                          placeholder="Nama (misal: 2 Keju)"
                          className="input input-sm text-xs"
                          style={{ flex: '1 1 0%', minWidth: 0, width: 'auto' }}
                          value={v.name}
                          onChange={(e) => {
                            const newVariants = [...variants];
                            newVariants[i].name = e.target.value;
                            setVariants(newVariants);
                          }}
                          required
                        />
                        <input
                          type="number"
                          placeholder="Harga Tambah"
                          className="input input-sm text-xs"
                          style={{ width: '120px', flex: '0 0 auto' }}
                          value={v.additionalPrice}
                          onChange={(e) => {
                            const newVariants = [...variants];
                            newVariants[i].additionalPrice = e.target.value;
                            setVariants(newVariants);
                          }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                          className="btn btn-ghost btn-icon btn-sm text-red-400 p-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
