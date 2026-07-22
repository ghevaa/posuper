// ============================================================
// POS Yoga — Admin Users Management Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { UserPlus, Trash2, Shield, Search, UserCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'admin' | 'cashier';
  createdAt: string;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier',
  });

  const { data: usersRes, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: User[] }>('/users'),
  });

  const users = usersRes?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Pengguna berhasil dibuat!');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'cashier' });
    },
    onError: (e: any) => toast.error(e.message || 'Gagal membuat pengguna'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role pengguna diperbarui');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal memperbarui role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Pengguna berhasil dihapus');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal menghapus pengguna'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error('Semua kolom wajib diisi');
      return;
    }
    createMutation.mutate(form);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'developer':
        return <span className="badge badge-warning flex items-center gap-1"><Shield size={12} /> Developer</span>;
      case 'admin':
        return <span className="badge badge-info flex items-center gap-1"><UserCheck size={12} /> Admin</span>;
      default:
        return <span className="badge badge-success flex items-center gap-1">Kasir</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Manajemen Pengguna</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
            Kelola akun kasir, admin, dan hak akses pengguna
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <UserPlus size={18} /> Tambah Pengguna
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10 text-sm"
          placeholder="Cari nama, email, atau role..."
        />
      </div>

      {/* Users Table */}
      <div className="glass-card overflow-hidden">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Tanggal Dibuat</th>
                {currentUser?.role === 'developer' && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <div className="spinner mx-auto" />
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-[var(--color-text-dim)]">
                    Tidak ada pengguna ditemukan
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-semibold text-sm">{u.name}</div>
                    </td>
                    <td className="text-sm text-[var(--color-text-muted)]">{u.email}</td>
                    <td>
                      {currentUser?.role === 'developer' && u.id !== currentUser.id ? (
                        <select
                          value={u.role}
                          onChange={(e) => updateRoleMutation.mutate({ id: u.id, role: e.target.value })}
                          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs px-2 py-1 focus:outline-none"
                        >
                          <option value="cashier">Kasir</option>
                          <option value="admin">Admin</option>
                          <option value="developer">Developer</option>
                        </select>
                      ) : (
                        getRoleBadge(u.role)
                      )}
                    </td>
                    <td className="text-xs text-[var(--color-text-dim)]">
                      {new Date(u.createdAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    {currentUser?.role === 'developer' && (
                      <td className="text-right">
                        {u.id !== currentUser.id && (
                          <button
                            onClick={() => {
                              if (confirm(`Yakin ingin menghapus pengguna ${u.name}?`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            className="btn btn-ghost btn-icon text-red-400 hover:text-red-300"
                            title="Hapus Pengguna"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border)]">
              <h3 className="font-bold text-lg">Tambah Pengguna Baru</h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: Kasir Budi"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="kasir@posyoga.com"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Role (Peran)</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="input text-sm"
                >
                  <option value="cashier">Kasir (Hanya Akses POS)</option>
                  <option value="admin">Admin (Akses Laporan & Produk)</option>
                  {currentUser?.role === 'developer' && <option value="developer">Developer (Akses Full System)</option>}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  Batal
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary flex-1">
                  {createMutation.isPending ? 'Menyimpan...' : 'Simpan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
