// ============================================================
// POS Yoga — Admin Users Management Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { UserPlus, Trash2, Shield, Search, UserCheck, X, Key, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/auth.store';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'admin' | 'cashier' | 'kitchen';
  createdAt: string;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

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

  const changePasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/users/${id}/password`, { newPassword }),
    onSuccess: () => {
      toast.success('Password pengguna berhasil diperbarui!');
      setChangePasswordUser(null);
      setNewPassword('');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal memperbarui password'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Pengguna berhasil dihapus');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal menghapus pengguna'),
  });

  const resetDbMutation = useMutation({
    mutationFn: () => api.post('/dev/reset-database', {}),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Seluruh data menu, transaksi, & kasir berhasil direset ke 0!');
      setShowResetModal(false);
    },
    onError: (e: any) => toast.error(e.message || 'Gagal mereset database'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error('Semua kolom wajib diisi');
      return;
    }
    createMutation.mutate(form);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePasswordUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }
    changePasswordMutation.mutate({ id: changePasswordUser.id, newPassword });
  };

  const filteredUsers = users
    .filter((u) => u.email !== 'ghedev@gmail.com')
    .filter(
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
      case 'kitchen':
        return <span className="badge badge-warning flex items-center gap-1">Dapur</span>;
      default:
        return <span className="badge badge-success flex items-center gap-1">Kasir</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Manajemen Pengguna & Sistem</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
            Kelola akun kasir, ubah password, dan reset data sistem
          </p>
        </div>
        <div className="flex gap-2">
          {(currentUser?.role === 'developer' || currentUser?.role === 'admin') && (
            <button onClick={() => setShowResetModal(true)} className="btn btn-secondary text-red-500 border-red-500/30 hover:bg-red-500/10">
              <RefreshCw size={16} /> Reset Semua Data
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <UserPlus size={18} /> Tambah Pengguna
          </button>
        </div>
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
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nama Pengguna</th>
                <th>Email</th>
                <th>Role</th>
                <th>Tanggal Dibuat</th>
                {(currentUser?.role === 'developer' || currentUser?.role === 'admin') && (
                  <th className="text-right">Aksi</th>
                )}
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
                          <option value="kitchen">Dapur</option>
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
                    {(currentUser?.role === 'developer' || currentUser?.role === 'admin') && (
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              setChangePasswordUser(u);
                              setNewPassword('');
                            }}
                            className="btn btn-ghost btn-icon text-blue-400 hover:text-blue-500"
                            title="Ganti Password"
                          >
                            <Key size={16} />
                          </button>
                          {u.id !== currentUser?.id && u.email !== 'ghedev@gmail.com' && (currentUser?.role === 'developer' || currentUser?.role === 'admin') && (
                            <button
                              onClick={() => {
                                if (confirm(`Yakin ingin menghapus akun ${u.name}?`)) {
                                  deleteMutation.mutate(u.id);
                                }
                              }}
                              className="btn btn-ghost btn-icon text-red-500 hover:text-red-600"
                              title="Hapus Pengguna"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
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
                  <option value="cashier">Kasir (Akses POS)</option>
                  <option value="kitchen">Dapur (Akses Pesanan Dapur)</option>
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

      {/* Change Password Modal */}
      {changePasswordUser && (
        <div className="modal-overlay" onClick={() => setChangePasswordUser(null)}>
          <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-blue-400" />
                <h3 className="font-bold text-lg">Ganti Password Pengguna</h3>
              </div>
              <button onClick={() => setChangePasswordUser(null)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-dim)]">Akun:</p>
                <p className="font-semibold text-sm">{changePasswordUser.name} ({changePasswordUser.email})</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Password Baru</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan password baru (min. 6 karakter)"
                  className="input text-sm"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setChangePasswordUser(null)} className="btn btn-secondary flex-1">
                  Batal
                </button>
                <button type="submit" disabled={changePasswordMutation.isPending} className="btn btn-primary flex-1">
                  {changePasswordMutation.isPending ? 'Memproses...' : 'Simpan Password Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Database Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-content max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={56} className="mx-auto text-red-500 mb-3" />
            <h3 className="font-bold text-xl text-red-500 mb-2">Reset Seluruh Data Sistem?</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
              Tindakan ini akan <strong>MENGHAPUS SEMUA DATA PERMANEN</strong>:<br />
              • Semua menu, varian, dan opsi kategori<br />
              • Semua riwayat transaksi, lapor closing, & kas shift<br />
              • Semua akun pengguna (kecuali akun Developer)
            </p>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowResetModal(false)} className="btn btn-secondary flex-1">
                Batal
              </button>
              <button
                type="button"
                onClick={() => resetDbMutation.mutate()}
                disabled={resetDbMutation.isPending}
                className="btn btn-danger flex-1 font-bold"
              >
                {resetDbMutation.isPending ? 'Mereset...' : 'Ya, Reset Dari 0'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
