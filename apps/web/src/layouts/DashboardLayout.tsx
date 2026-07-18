// ============================================================
// POS Yoga — Sidebar Layout
// ============================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import {
  LayoutDashboard, ShoppingCart, Package, Tag, Receipt,
  BarChart3, Users, Settings, DollarSign, Clock,
  Shield, Database, FileText, LogOut, Menu, X, UserCircle, ClipboardList,
} from 'lucide-react';
import { useState } from 'react';

const cashierLinks = [
  { to: '/pos', icon: ShoppingCart, label: 'POS' },
  { to: '/pos/history', icon: Clock, label: 'Riwayat Hari Ini' },
];

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/products', icon: Package, label: 'Produk' },
  { to: '/admin/categories', icon: Tag, label: 'Kategori' },
  { to: '/admin/transactions', icon: Receipt, label: 'Transaksi' },
  { to: '/admin/reports', icon: BarChart3, label: 'Laporan' },
  { to: '/admin/expenses', icon: DollarSign, label: 'Pengeluaran' },
  { to: '/admin/stock-opname', icon: ClipboardList, label: 'Stok Opname' },
  { to: '/admin/users', icon: Users, label: 'Pengguna' },
  { to: '/admin/customers', icon: UserCircle, label: 'Pelanggan' },
];

const developerLinks = [
  { to: '/dev', icon: Shield, label: 'System' },
  { to: '/dev/backup', icon: Database, label: 'Backup' },
  { to: '/dev/logs', icon: FileText, label: 'Logs' },
  { to: '/dev/settings', icon: Settings, label: 'Pengaturan' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const links = (() => {
    const sections: { title: string; items: typeof cashierLinks }[] = [];
    if (user?.role === 'cashier' || user?.role === 'admin' || user?.role === 'developer') {
      sections.push({ title: 'Kasir', items: cashierLinks });
    }
    if (user?.role === 'admin' || user?.role === 'developer') {
      sections.push({ title: 'Admin', items: adminLinks });
    }
    if (user?.role === 'developer') {
      sections.push({ title: 'Developer', items: developerLinks });
    }
    return sections;
  })();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border)]">
          <img 
            src="/logo.jpg" 
            alt="D'Mac Logo" 
            className="w-10 h-10 rounded-xl object-cover border border-[var(--color-border)]"
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold gradient-text truncate leading-tight">D'Mac Chicken</h1>
            <p className="text-[10px] text-[var(--color-text-dim)] capitalize leading-none mt-1">{user?.role}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {links.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-5 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-dim)]">
                {section.title}
              </p>
              {section.items.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/admin' || link.to === '/dev'}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'active' : ''}`
                  }
                >
                  <link.icon size={18} />
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="p-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-[var(--color-surface-lighter)] flex items-center justify-center text-sm font-semibold">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[11px] text-[var(--color-text-dim)] truncate flex items-center justify-between">
                <span>{user?.email}</span>
                <span className="text-[9px] bg-[var(--color-surface-lighter)] text-[var(--color-text-dim)] px-1 rounded font-mono">v0.1.3</span>
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-ghost w-full text-left text-sm">
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={`flex-1 transition-all ${sidebarOpen ? 'ml-[260px]' : 'ml-0'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-6 py-3 bg-[var(--color-surface)]/80 backdrop-blur-md border-b border-[var(--color-border)]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn btn-ghost btn-icon"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
