// ============================================================
// POS Yoga — Admin Categories & Option Groups Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Plus, Pencil, Trash2, X, Loader2, Type, Sliders, Layers, Settings2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { getLocalCategories, cacheCategories } from '../lib/offline-db';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface OptionItem {
  id?: string;
  name: string;
  price: number;
}

interface CategoryOptionGroup {
  id: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  isRequired: boolean;
  isMultiple: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionItem[];
}

export default function AdminCategories() {
  const qc = useQueryClient();
  const [activeMainTab, setActiveMainTab] = useState<'categories' | 'optionGroups'>('categories');

  // Category Form State
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: '🍔', color: '#ef4444' });

  // Option Group Form State
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupModalTab, setGroupModalTab] = useState<'name' | 'type'>('name');
  const [editingGroup, setEditingGroup] = useState<CategoryOptionGroup | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    categoryId: '',
    isRequired: false,
    isMultiple: false,
    minSelect: 0,
    maxSelect: 1,
    options: [{ name: '', price: 0 }],
  });

  // Queries
  const { data: catRes, isLoading: isCatLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: Category[] }>('/categories');
        if (res.data) cacheCategories(res.data as any);
        return res;
      } catch {
        const local = await getLocalCategories();
        return { data: local as unknown as Category[] };
      }
    },
  });

  const { data: optionGroupsRes, isLoading: isGroupsLoading } = useQuery({
    queryKey: ['category-option-groups'],
    queryFn: () => api.get<{ data: CategoryOptionGroup[] }>('/category-option-groups'),
  });

  const categories = catRes?.data || [];
  const optionGroups = optionGroupsRes?.data || [];

  // Category Mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: any) => api.post('/categories', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori ditambahkan');
      closeCategoryForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/categories/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori diperbarui');
      closeCategoryForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Kategori dihapus');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Option Group Mutations
  const createGroupMutation = useMutation({
    mutationFn: (data: any) => api.post('/category-option-groups', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-option-groups'] });
      toast.success('Grup opsi berhasil dibuat');
      closeGroupForm();
    },
    onError: (e: any) => toast.error(e.message || 'Gagal membuat grup opsi'),
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/category-option-groups/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-option-groups'] });
      toast.success('Grup opsi diperbarui');
      closeGroupForm();
    },
    onError: (e: any) => toast.error(e.message || 'Gagal memperbarui grup opsi'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/category-option-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-option-groups'] });
      toast.success('Grup opsi dihapus');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal menghapus grup opsi'),
  });

  // Handlers for Category Form
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', icon: '🍔', color: '#ef4444' });
    setShowCategoryForm(true);
  };

  const openEditCategory = (c: Category) => {
    setEditingCategory(c);
    setCategoryForm({ name: c.name, icon: c.icon || '🍔', color: c.color || '#ef4444' });
    setShowCategoryForm(true);
  };

  const closeCategoryForm = () => {
    setShowCategoryForm(false);
    setEditingCategory(null);
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) updateCategoryMutation.mutate({ id: editingCategory.id, data: categoryForm });
    else createCategoryMutation.mutate(categoryForm);
  };

  // Handlers for Option Group Form
  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupModalTab('name');
    setGroupForm({
      name: '',
      categoryId: categories[0]?.id || '',
      isRequired: false,
      isMultiple: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: '', price: 0 }],
    });
    setShowGroupForm(true);
  };

  const openEditGroup = (g: CategoryOptionGroup) => {
    setEditingGroup(g);
    setGroupModalTab('name');
    setGroupForm({
      name: g.name,
      categoryId: g.categoryId,
      isRequired: g.isRequired,
      isMultiple: g.isMultiple,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.length > 0 ? g.options.map(o => ({ name: o.name, price: Number(o.price) })) : [{ name: '', price: 0 }],
    });
    setShowGroupForm(true);
  };

  const closeGroupForm = () => {
    setShowGroupForm(false);
    setEditingGroup(null);
  };

  const handleAddOptionRow = () => {
    setGroupForm(prev => ({
      ...prev,
      options: [...prev.options, { name: '', price: 0 }],
    }));
  };

  const handleRemoveOptionRow = (index: number) => {
    setGroupForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const handleOptionChange = (index: number, field: 'name' | 'price', val: any) => {
    setGroupForm(prev => {
      const updated = [...prev.options];
      updated[index] = { ...updated[index], [field]: val };
      return { ...prev, options: updated };
    });
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name) {
      toast.error('Nama grup opsi wajib diisi');
      return;
    }
    if (!groupForm.categoryId) {
      toast.error('Kategori wajib dipilih');
      return;
    }

    const payload = {
      ...groupForm,
      options: groupForm.options.filter(o => o.name.trim() !== ''),
    };

    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, data: payload });
    } else {
      createGroupMutation.mutate(payload);
    }
  };

  const icons = ['🍔', '☕', '🍿', '🍰', '🍕', '🥗', '🍦', '🍜'];
  const colors = ['#ef4444', '#3b82f6', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#06b6d4', '#f97316'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kategori & Varian</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Kelola kategori produk dan grup opsi/varian per kategori</p>
        </div>
        <div className="flex gap-2">
          {activeMainTab === 'categories' ? (
            <button onClick={openCreateCategory} className="btn btn-primary">
              <Plus size={18} /> Tambah Kategori
            </button>
          ) : (
            <button onClick={openCreateGroup} className="btn btn-primary">
              <Plus size={18} /> Tambah Grup Opsi
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-[var(--color-border)] gap-6">
        <button
          onClick={() => setActiveMainTab('categories')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeMainTab === 'categories'
              ? 'border-[var(--color-primary-500)] text-[var(--color-primary-400)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <Layers size={16} /> Daftar Kategori ({categories.length})
        </button>

        <button
          onClick={() => setActiveMainTab('optionGroups')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeMainTab === 'optionGroups'
              ? 'border-[var(--color-primary-500)] text-[var(--color-primary-400)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-white'
          }`}
        >
          <Settings2 size={16} /> Grup Opsi / Varian ({optionGroups.length})
        </button>
      </div>

      {/* TAB 1: CATEGORIES */}
      {activeMainTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isCatLoading ? (
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
                  <button onClick={() => openEditCategory(c)} className="btn btn-ghost btn-icon btn-sm">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Hapus kategori ini?')) deleteCategoryMutation.mutate(c.id); }}
                    className="btn btn-ghost btn-icon btn-sm text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: OPTION GROUPS */}
      {activeMainTab === 'optionGroups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isGroupsLoading ? (
            <div className="col-span-full flex justify-center py-8"><div className="spinner" /></div>
          ) : optionGroups.length === 0 ? (
            <div className="col-span-full glass-card p-8 text-center">
              <Settings2 size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-[var(--color-text-dim)]">Belum ada grup opsi / varian per kategori</p>
              <button onClick={openCreateGroup} className="btn btn-primary btn-sm mt-4">
                <Plus size={14} /> Buat Grup Opsi Baru
              </button>
            </div>
          ) : (
            optionGroups.map((g) => (
              <div key={g.id} className="glass-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base text-white capitalize">{g.name}</h3>
                    <p className="text-xs text-[var(--color-primary-400)] font-medium mt-0.5">
                      Kategori: {g.categoryName || 'General'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditGroup(g)} className="btn btn-ghost btn-icon btn-sm">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Hapus grup opsi "${g.name}"?`)) deleteGroupMutation.mutate(g.id); }}
                      className="btn btn-ghost btn-icon btn-sm text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Option Badges / Flags */}
                <div className="flex gap-2 text-[11px]">
                  <span className={`px-2 py-0.5 rounded font-medium ${g.isRequired ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {g.isRequired ? 'Wajib Pilih' : 'Opsional'}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-medium ${g.isMultiple ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {g.isMultiple ? 'Pilihan Ganda' : 'Pilihan Tunggal'}
                  </span>
                </div>

                {/* Options List */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
                  {g.options.map(opt => (
                    <div key={opt.id} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-[var(--color-surface-lighter)]">
                      <span className="font-medium text-gray-200">{opt.name}</span>
                      <span className="font-mono text-emerald-400">+Rp {Number(opt.price).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CATEGORY FORM MODAL */}
      {showCategoryForm && (
        <div className="modal-overlay" onClick={closeCategoryForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}</h3>
              <button onClick={closeCategoryForm} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Kategori</label>
                <input className="input" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">Pilih Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {icons.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setCategoryForm({ ...categoryForm, icon: ic })}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl border ${categoryForm.icon === ic ? 'border-blue-500 bg-blue-500/10' : 'border-[var(--color-border)]'}`}
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
                      onClick={() => setCategoryForm({ ...categoryForm, color: col })}
                      className="w-8 h-8 rounded-full border-2"
                      style={{ backgroundColor: col, borderColor: categoryForm.color === col ? 'white' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}>
                {(createCategoryMutation.isPending || updateCategoryMutation.isPending) ? <Loader2 size={18} className="animate-spin" /> : (editingCategory ? 'Simpan' : 'Tambah')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* OPTION GROUP FORM MODAL (Matching User Screenshots Exactly!) */}
      {showGroupForm && (
        <div className="modal-overlay" onClick={closeGroupForm}>
          <div className="modal-content max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-bold">
                {editingGroup ? 'Edit Grup Opsi' : 'Tambah Grup Opsi'}
              </h3>
              <button onClick={closeGroupForm} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>

            {/* Modal Steps / Tabs */}
            <div className="flex justify-center gap-6 mb-6">
              <button
                type="button"
                onClick={() => setGroupModalTab('name')}
                className={`flex flex-col items-center gap-1 ${groupModalTab === 'name' ? 'text-lime-400' : 'text-gray-400'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${groupModalTab === 'name' ? 'bg-lime-500/20 border-2 border-lime-400' : 'bg-gray-800'}`}>
                  <Type size={18} />
                </div>
                <span className="text-xs font-semibold">Nama Grup Opsi</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupModalTab('type')}
                className={`flex flex-col items-center gap-1 ${groupModalTab === 'type' ? 'text-lime-400' : 'text-gray-400'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${groupModalTab === 'type' ? 'bg-lime-500/20 border-2 border-lime-400' : 'bg-gray-800'}`}>
                  <Sliders size={18} />
                </div>
                <span className="text-xs font-semibold">Tipe Opsi</span>
              </button>
            </div>

            <form onSubmit={handleGroupSubmit} className="space-y-4">
              {/* TAB 1: NAMA GRUP OPSI & OPTIONS LIST */}
              {groupModalTab === 'name' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 block">Nama Grup Opsi</label>
                    <input
                      className="input"
                      placeholder="Contoh: extra saus"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 block">Kategori Terkait</label>
                    <select
                      className="input"
                      value={groupForm.categoryId}
                      onChange={(e) => setGroupForm({ ...groupForm, categoryId: e.target.value })}
                      required
                    >
                      <option value="">Pilih Kategori</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Options List */}
                  <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[var(--color-text-muted)]">Opsi Pilihan (Varian)</label>
                      <button
                        type="button"
                        onClick={handleAddOptionRow}
                        className="btn btn-secondary btn-sm text-xs py-1 px-3 text-cyan-400 border border-cyan-500/30"
                      >
                        + Tambah Opsi
                      </button>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {groupForm.options.map((opt, idx) => (
                        <div key={idx} className="flex gap-2 items-center glass-card p-2 bg-[var(--color-surface-lighter)]">
                          <input
                            type="text"
                            placeholder="Contoh: extra bbq spicy"
                            className="input text-xs flex-1 py-1.5"
                            value={opt.name}
                            onChange={(e) => handleOptionChange(idx, 'name', e.target.value)}
                            required
                          />
                          <div className="w-32 relative">
                            <span className="absolute left-2 top-2 text-[10px] text-[var(--color-text-dim)]">Rp</span>
                            <input
                              type="number"
                              placeholder="0"
                              className="input text-xs pl-7 py-1.5 font-mono"
                              value={opt.price}
                              onChange={(e) => handleOptionChange(idx, 'price', Number(e.target.value))}
                            />
                          </div>
                          {groupForm.options.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOptionRow(idx)}
                              className="btn btn-ghost btn-icon btn-sm text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TIPE OPSI (TOGGLES & MIN/MAX) */}
              {groupModalTab === 'type' && (
                <div className="space-y-5">
                  {/* Wajib dipilih Toggle */}
                  <div className="flex items-center justify-between p-3 glass-card rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-white">Wajib dipilih</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Customer harus memilih salah satu opsi</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={groupForm.isRequired}
                        onChange={(e) => setGroupForm({ ...groupForm, isRequired: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Pilihan Ganda Toggle */}
                  <div className="flex items-center justify-between p-3 glass-card rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-white">Pilihan Ganda</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Customer dapat memilih lebih dari satu opsi</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={groupForm.isMultiple}
                        onChange={(e) => setGroupForm({ ...groupForm, isMultiple: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Min / Max Select */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 block">Pilihan Minimum</label>
                      <input
                        type="number"
                        min={0}
                        className="input text-sm font-mono"
                        value={groupForm.minSelect}
                        onChange={(e) => setGroupForm({ ...groupForm, minSelect: Number(e.target.value) })}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 block">Pilihan Maximum</label>
                      <input
                        type="number"
                        min={1}
                        className="input text-sm font-mono"
                        value={groupForm.maxSelect}
                        onChange={(e) => setGroupForm({ ...groupForm, maxSelect: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-2 pt-4 border-t border-[var(--color-border)]">
                <button type="button" onClick={closeGroupForm} className="btn btn-secondary flex-1">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {(createGroupMutation.isPending || updateGroupMutation.isPending) ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    'Simpan Grup Opsi'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
