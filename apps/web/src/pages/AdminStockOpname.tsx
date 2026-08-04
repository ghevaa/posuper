// ============================================================
// POS Yoga — Admin Stock Opname Page
// ============================================================

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Plus, Trash2, X, Loader2, Download, Save, ChevronLeft, ClipboardList, CalendarPlus, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

interface StockInEntry {
  date: string; // yyyy-mm-dd
  qty: number;
}

interface StockOpnameItem {
  id: string;
  productId: string | null;
  categoryId: string | null;
  productName: string;
  unit: string;
  stockStart: number;
  stockIn: number;
  stockInEntries: StockInEntry[];
  stockReal: number;
  usage: number;
  waste: number;
  notes: string | null;
}

interface StockOpnameCategory {
  id: string;
  name: string;
}

interface StockOpnameSession {
  id: string;
  name: string;
  date: string;
  notes: string | null;
  createdAt: string;
  items?: StockOpnameItem[];
  itemCount?: number;
}

const UNCATEGORIZED = '__uncategorized__';

function sumEntries(entries: StockInEntry[] | undefined | null): number {
  if (!entries || !Array.isArray(entries)) return 0;
  return entries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
}

export default function AdminStockOpname() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<StockOpnameItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Add-item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemForm, setAddItemForm] = useState({ productName: '', unit: 'Pcs', categoryId: '', stockStart: 0 });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);

  // Barang masuk popover state: { itemId, date, qty }
  const [stockInPopover, setStockInPopover] = useState<string | null>(null);
  const [stockInDraft, setStockInDraft] = useState({ date: new Date().toISOString().slice(0, 10), qty: '' });

  // Queries
  const { data: sessionsRes, isLoading } = useQuery({
    queryKey: ['stock-opname'],
    queryFn: () => api.get<{ data: StockOpnameSession[] }>('/stock-opname'),
  });

  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ['stock-opname', selectedSession],
    queryFn: () => api.get<{ data: StockOpnameSession }>(`/stock-opname/${selectedSession}`),
    enabled: !!selectedSession,
  });

  const { data: categoriesRes } = useQuery({
    queryKey: ['stock-opname-categories'],
    queryFn: () => api.get<{ data: StockOpnameCategory[] }>('/stock-opname/categories'),
  });

  const sessions = sessionsRes?.data || [];
  const categories = categoriesRes?.data || [];
  const categoryNameMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  // When detail loads, populate editItems
  const sessionDetail = detailRes?.data;
  if (sessionDetail?.items && editItems.length === 0 && selectedSession) {
    setEditItems(sessionDetail.items.map((i) => ({ ...i, stockInEntries: i.stockInEntries || [] })));
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/stock-opname', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-opname'] });
      setShowCreate(false);
      setCreateForm({ name: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      toast.success('Stok opname baru berhasil dibuat');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/stock-opname/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-opname'] });
      toast.success('Stok opname dihapus');
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => api.post<{ data: StockOpnameCategory }>('/stock-opname/categories', { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['stock-opname-categories'] });
      setNewCategoryName('');
      setShowNewCategoryInput(false);
      toast.success('Kategori baru ditambahkan');
      return res;
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addItemMutation = useMutation({
    mutationFn: (data: typeof addItemForm) => api.post(`/stock-opname/${selectedSession}/items`, {
      productName: data.productName,
      unit: data.unit,
      categoryId: data.categoryId || null,
      stockStart: data.stockStart,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-opname', selectedSession] });
      setEditItems([]); // force re-populate from fresh data
      setShowAddItem(false);
      setAddItemForm({ productName: '', unit: 'Pcs', categoryId: '', stockStart: 0 });
      toast.success('Bahan berhasil ditambahkan');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/stock-opname/${selectedSession}/items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-opname', selectedSession] });
      setEditItems([]);
      toast.success('Bahan dihapus');
    },
  });

  // Update item locally
  const updateItem = (index: number, field: keyof StockOpnameItem, value: any) => {
    const updated = [...editItems];
    (updated[index] as any)[field] = value;
    if (field === 'stockStart' || field === 'stockReal') {
      const it = updated[index];
      it.stockIn = sumEntries(it.stockInEntries);
      it.usage = it.stockStart + it.stockIn - it.stockReal;
    }
    setEditItems(updated);
  };

  const addStockInEntry = (index: number) => {
    if (!stockInDraft.qty || Number(stockInDraft.qty) === 0) {
      toast.error('Isi jumlah barang masuk dulu');
      return;
    }
    const updated = [...editItems];
    const it = updated[index];
    const entries = [...(it.stockInEntries || [])];
    const existingIdx = entries.findIndex((e) => e.date === stockInDraft.date);
    if (existingIdx >= 0) {
      entries[existingIdx] = { date: stockInDraft.date, qty: Number(stockInDraft.qty) };
    } else {
      entries.push({ date: stockInDraft.date, qty: Number(stockInDraft.qty) });
    }
    it.stockInEntries = entries;
    it.stockIn = sumEntries(entries);
    it.usage = it.stockStart + it.stockIn - it.stockReal;
    setEditItems(updated);
    setStockInDraft({ date: stockInDraft.date, qty: '' });
    setStockInPopover(null);
  };

  const removeStockInEntry = (index: number, date: string) => {
    const updated = [...editItems];
    const it = updated[index];
    it.stockInEntries = (it.stockInEntries || []).filter((e) => e.date !== date);
    it.stockIn = sumEntries(it.stockInEntries);
    it.usage = it.stockStart + it.stockIn - it.stockReal;
    setEditItems(updated);
  };

  // Save all items
  const handleSaveItems = async () => {
    if (!selectedSession) return;
    setSaving(true);
    try {
      await api.put(`/stock-opname/${selectedSession}/items`, {
        items: editItems.map((i) => ({
          id: i.id,
          unit: i.unit,
          categoryId: i.categoryId || null,
          stockStart: i.stockStart,
          stockInEntries: i.stockInEntries || [],
          stockReal: i.stockReal,
          waste: i.waste,
          notes: i.notes,
        })),
      });
      qc.invalidateQueries({ queryKey: ['stock-opname', selectedSession] });
      toast.success('Data stok opname berhasil disimpan');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Export Excel
  const handleExport = async (id: string) => {
    try {
      await api.downloadFile(`/stock-opname/${id}/export`, `stok-opname-${id}.xlsx`);
      toast.success('File Excel berhasil diunduh');
    } catch (err: any) {
      toast.error(err.message || 'Gagal export Excel');
    }
  };

  const handleCreateCategoryInline = () => {
    if (!newCategoryName.trim()) return;
    addCategoryMutation.mutate(newCategoryName.trim());
  };

  // Group editItems by categoryId for display
  const groupedItems = useMemo(() => {
    const groups: Record<string, { name: string; items: { item: StockOpnameItem; index: number }[] }> = {};
    editItems.forEach((item, index) => {
      const key = item.categoryId || UNCATEGORIZED;
      const name = item.categoryId ? categoryNameMap.get(item.categoryId) || 'Kategori Terhapus' : 'Tanpa Kategori';
      if (!groups[key]) groups[key] = { name, items: [] };
      groups[key].items.push({ item, index });
    });
    return groups;
  }, [editItems, categoryNameMap]);

  // Detail View
  if (selectedSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedSession(null); setEditItems([]); }} className="btn btn-ghost btn-icon">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">{sessionDetail?.name || 'Stok Opname'}</h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                {sessionDetail?.date ? formatDate(sessionDetail.date) : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddItem(true)} className="btn btn-secondary">
              <Plus size={16} /> Tambah Bahan
            </button>
            <button onClick={() => handleExport(selectedSession)} className="btn btn-secondary">
              <Download size={16} /> Export Excel
            </button>
            <button onClick={handleSaveItems} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Simpan
            </button>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
        ) : editItems.length === 0 ? (
          <div className="glass-card p-8 text-center text-[var(--color-text-dim)]">
            <ClipboardList size={40} className="mx-auto mb-2 opacity-30" />
            Tidak ada item. Klik "Tambah Bahan" untuk mulai mencatat.
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(groupedItems).map(([key, group]) => (
              <div key={key} className="table-container">
                <div className="px-3 py-2 font-semibold text-sm" style={{ background: 'var(--color-accent-cyan, #00b8d9)', color: '#003a3d' }}>
                  {group.name}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '32px' }}>No</th>
                      <th>Nama Bahan</th>
                      <th style={{ width: '110px' }}>Kategori</th>
                      <th style={{ width: '60px' }}>SAT</th>
                      <th style={{ width: '90px' }}>Qty Awal</th>
                      <th style={{ width: '150px' }}>Barang Masuk</th>
                      <th style={{ width: '90px' }}>Total Stok</th>
                      <th style={{ width: '100px' }}>Stok Fisik (Riil)</th>
                      <th style={{ width: '80px' }}>Terpakai</th>
                      <th style={{ width: '130px' }}>Keterangan / Rusak</th>
                      <th style={{ width: '36px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(({ item, index: idx }, i) => {
                      const totalStock = (item.stockStart || 0) + sumEntries(item.stockInEntries);
                      return (
                        <tr key={item.id}>
                          <td className="text-center text-[var(--color-text-dim)]">{i + 1}</td>
                          <td className="font-medium">{item.productName}</td>
                          <td>
                            <select
                              className="input text-xs p-1"
                              value={item.categoryId || ''}
                              onChange={(e) => updateItem(idx, 'categoryId', e.target.value || null)}
                            >
                              <option value="">Tanpa Kategori</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="input text-xs text-center p-1"
                              style={{ width: '55px' }}
                              value={item.unit}
                              onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="input text-xs text-center p-1"
                              style={{ width: '75px' }}
                              value={item.stockStart}
                              onChange={(e) => updateItem(idx, 'stockStart', Number(e.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1">
                              {(item.stockInEntries || []).map((entry) => (
                                <span key={entry.date} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-hover,#1e293b)]">
                                  {new Date(entry.date).getDate()}/{new Date(entry.date).getMonth() + 1}: {entry.qty}
                                  <button onClick={() => removeStockInEntry(idx, entry.date)} className="opacity-60 hover:opacity-100">
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                              <div className="relative">
                                <button
                                  onClick={() => { setStockInPopover(stockInPopover === item.id ? null : item.id); setStockInDraft({ date: new Date().toISOString().slice(0, 10), qty: '' }); }}
                                  className="btn btn-ghost btn-icon btn-sm"
                                  title="Tambah tanggal barang masuk"
                                >
                                  <CalendarPlus size={14} />
                                </button>
                                {stockInPopover === item.id && (
                                  <div className="absolute z-10 top-full left-0 mt-1 p-2 rounded shadow-lg glass-card space-y-2" style={{ minWidth: '190px' }}>
                                    <input
                                      type="date"
                                      className="input text-xs p-1 w-full"
                                      value={stockInDraft.date}
                                      onChange={(e) => setStockInDraft({ ...stockInDraft, date: e.target.value })}
                                    />
                                    <input
                                      type="number"
                                      placeholder="Qty"
                                      className="input text-xs p-1 w-full"
                                      value={stockInDraft.qty}
                                      onChange={(e) => setStockInDraft({ ...stockInDraft, qty: e.target.value })}
                                    />
                                    <div className="flex gap-1">
                                      <button onClick={() => addStockInEntry(idx)} className="btn btn-primary btn-sm flex-1">Tambah</button>
                                      <button onClick={() => setStockInPopover(null)} className="btn btn-ghost btn-sm">Batal</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center font-medium">{totalStock}</td>
                          <td>
                            <input
                              type="number"
                              className="input text-xs text-center p-1"
                              style={{ width: '85px' }}
                              value={item.stockReal}
                              onChange={(e) => updateItem(idx, 'stockReal', Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="text-center">
                            <span className={`font-semibold ${item.usage > 0 ? 'text-orange-400' : item.usage < 0 ? 'text-red-400' : ''}`}>
                              {item.usage}
                            </span>
                          </td>
                          <td>
                            <input
                              className="input text-xs p-1"
                              style={{ width: '120px' }}
                              placeholder="waste / catatan"
                              value={item.notes || ''}
                              onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              onClick={() => { if (confirm(`Hapus "${item.productName}"?`)) deleteItemMutation.mutate(item.id); }}
                              className="btn btn-ghost btn-icon btn-sm text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <div className="glass-card p-4">
          <p className="text-xs text-[var(--color-text-dim)]">
            💡 Rumus: <strong>Total Stok = Qty Awal + Barang Masuk</strong>, <strong>Terpakai = Total Stok - Stok Fisik (Riil)</strong>.
            Klik ikon kalender untuk mencatat barang masuk di tanggal tertentu. Klik "Simpan" untuk menyimpan perubahan, atau "Export Excel" untuk mengunduh rekap lengkap per kategori.
          </p>
        </div>

        {/* Add Item Modal */}
        {showAddItem && (
          <div className="modal-overlay" onClick={() => setShowAddItem(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Tambah Bahan Baku</h3>
                <button onClick={() => setShowAddItem(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addItemMutation.mutate(addItemForm); }} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Bahan</label>
                  <input
                    className="input"
                    placeholder="misal: Ayam Marinasi (Siap Goreng)"
                    value={addItemForm.productName}
                    onChange={(e) => setAddItemForm({ ...addItemForm, productName: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Satuan</label>
                    <input
                      className="input"
                      placeholder="Pcs / Kg / L"
                      value={addItemForm.unit}
                      onChange={(e) => setAddItemForm({ ...addItemForm, unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Qty Awal</label>
                    <input
                      type="number"
                      className="input"
                      value={addItemForm.stockStart}
                      onChange={(e) => setAddItemForm({ ...addItemForm, stockStart: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block flex items-center justify-between">
                    <span>Kategori</span>
                    <button type="button" onClick={() => setShowNewCategoryInput(!showNewCategoryInput)} className="text-xs text-[var(--color-primary,#22d3ee)] flex items-center gap-1">
                      <Tag size={12} /> Tambah Kategori
                    </button>
                  </label>
                  {showNewCategoryInput && (
                    <div className="flex gap-2 mb-2">
                      <input
                        className="input flex-1"
                        placeholder="misal: Kelompok Daging & Ayam"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          addCategoryMutation.mutate(newCategoryName.trim(), {
                            onSuccess: (res: any) => {
                              if (res?.data?.id) setAddItemForm((f) => ({ ...f, categoryId: res.data.id }));
                            },
                          });
                        }}
                        disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                        className="btn btn-secondary btn-sm"
                      >
                        {addCategoryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}
                      </button>
                    </div>
                  )}
                  <select
                    className="input"
                    value={addItemForm.categoryId}
                    onChange={(e) => setAddItemForm({ ...addItemForm, categoryId: e.target.value })}
                  >
                    <option value="">Tanpa Kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={addItemMutation.isPending}>
                  {addItemMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Tambah Bahan'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stok Opname</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Pencatatan stok harian & penghitungan pemakaian</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={18} /> Buat Stok Opname
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nama / Periode</th>
              <th>Tanggal</th>
              <th>Jumlah Item</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-[var(--color-text-dim)]">
                <ClipboardList size={40} className="mx-auto mb-2 opacity-30" />
                Belum ada stok opname. Klik "Buat Stok Opname" untuk memulai.
              </td></tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-[var(--color-text-muted)]">{formatDate(s.date)}</td>
                  <td>{s.itemCount ?? '-'} item</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => { setSelectedSession(s.id); setEditItems([]); }} className="btn btn-secondary btn-sm">Lihat</button>
                      <button onClick={() => handleExport(s.id)} className="btn btn-ghost btn-icon btn-sm"><Download size={14} /></button>
                      <button onClick={() => { if (confirm('Hapus stok opname ini?')) deleteMutation.mutate(s.id); }} className="btn btn-ghost btn-icon btn-sm text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Buat Stok Opname Baru</h3>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(createForm); }} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Periode</label>
                <input
                  className="input"
                  placeholder="misal: JULI 10-16"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Tanggal</label>
                <input
                  type="date"
                  className="input"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Catatan (Opsional)</label>
                <input
                  className="input"
                  placeholder="Catatan tambahan..."
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </div>
              <p className="text-xs text-[var(--color-text-dim)]">
                Semua produk aktif akan otomatis ditambahkan ke daftar stok opname dengan stok awal diambil dari data stok saat ini.
                Bahan baku tambahan (yang bukan produk jualan) bisa ditambahkan manual lewat tombol "Tambah Bahan" di halaman detail.
              </p>
              <button type="submit" className="btn btn-primary w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Buat Stok Opname'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
