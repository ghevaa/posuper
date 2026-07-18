// ============================================================
// POS Yoga — Admin Stock Opname Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Plus, Trash2, X, Loader2, Download, Save, ChevronLeft, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

interface StockOpnameItem {
  id: string;
  productId: string | null;
  productName: string;
  unit: string;
  stockStart: number;
  stockIn: number;
  stockReal: number;
  usage: number;
  waste: number;
  notes: string | null;
}

interface StockOpnameSession {
  id: string;
  name: string;
  date: string;
  notes: string | null;
  createdAt: string;
  items?: StockOpnameItem[];
  _count?: number;
}

export default function AdminStockOpname() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<StockOpnameItem[]>([]);
  const [saving, setSaving] = useState(false);

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

  const sessions = sessionsRes?.data || [];

  // When detail loads, populate editItems
  const sessionDetail = detailRes?.data;
  if (sessionDetail?.items && editItems.length === 0 && selectedSession) {
    setEditItems(sessionDetail.items.map(i => ({ ...i })));
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

  // Update item locally
  const updateItem = (index: number, field: keyof StockOpnameItem, value: any) => {
    const updated = [...editItems];
    (updated[index] as any)[field] = value;
    // Recalculate usage
    updated[index].usage = updated[index].stockStart + updated[index].stockIn - updated[index].stockReal;
    setEditItems(updated);
  };

  // Save all items
  const handleSaveItems = async () => {
    if (!selectedSession) return;
    setSaving(true);
    try {
      await api.put(`/stock-opname/${selectedSession}/items`, {
        items: editItems.map(i => ({
          id: i.id,
          unit: i.unit,
          stockStart: i.stockStart,
          stockIn: i.stockIn,
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
      const token = localStorage.getItem('pos_yoga_session_token');
      const IS_TAURI = !!(window as any).__TAURI_INTERNALS__;
      const BASE_URL = IS_TAURI ? 'http://72.61.214.92:8080' : '';
      const res = await fetch(`${BASE_URL}/api/stock-opname/${id}/export`, {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Gagal export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stok-opname-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('File Excel berhasil diunduh');
    } catch (err: any) {
      toast.error(err.message || 'Gagal export Excel');
    }
  };

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
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{width:'40px'}}>No</th>
                  <th>Nama Bahan Utama</th>
                  <th style={{width:'70px'}}>SAT</th>
                  <th style={{width:'100px'}}>Stok Awal (Pagi)</th>
                  <th style={{width:'100px'}}>Barang Masuk</th>
                  <th style={{width:'120px'}}>Stok Fisik Riil (Malam)</th>
                  <th style={{width:'110px'}}>Pemakaian Terhitung</th>
                  <th style={{width:'140px'}}>Keterangan / Rusak</th>
                </tr>
              </thead>
              <tbody>
                {editItems.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-dim)]">Tidak ada item</td></tr>
                ) : (
                  editItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="text-center text-[var(--color-text-dim)]">{idx + 1}</td>
                      <td className="font-medium">{item.productName}</td>
                      <td>
                        <input
                          className="input text-xs text-center p-1"
                          style={{ width: '60px' }}
                          value={item.unit}
                          onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input text-xs text-center p-1"
                          style={{ width: '80px' }}
                          value={item.stockStart}
                          onChange={(e) => updateItem(idx, 'stockStart', Number(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input text-xs text-center p-1"
                          style={{ width: '80px' }}
                          value={item.stockIn}
                          onChange={(e) => updateItem(idx, 'stockIn', Number(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input text-xs text-center p-1"
                          style={{ width: '100px' }}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="glass-card p-4">
          <p className="text-xs text-[var(--color-text-dim)]">
            💡 Rumus: <strong>Pemakaian = Stok Awal (Pagi) + Barang Masuk - Stok Fisik Riil (Malam)</strong>. 
            Kolom pemakaian dihitung otomatis. Klik "Simpan" untuk menyimpan perubahan, atau "Export Excel" untuk mengunduh.
          </p>
        </div>
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
                  <td>{s._count ?? '-'} item</td>
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
