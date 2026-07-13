// ============================================================
// POS Yoga — Admin Dashboard Page
// ============================================================

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import {
  DollarSign, ShoppingCart, TrendingUp, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#f97316'];

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<{ data: any }>('/dashboard'),
    refetchInterval: 30000,
  });

  const stats = data?.data;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  const statCards = [
    { label: 'Pendapatan Hari Ini', value: formatCurrency(stats?.revenueToday || 0), icon: DollarSign, color: 'from-blue-500 to-cyan-400', glow: 'shadow-blue-500/20' },
    { label: 'Pendapatan Minggu', value: formatCurrency(stats?.revenueWeek || 0), icon: TrendingUp, color: 'from-purple-500 to-pink-400', glow: 'shadow-purple-500/20' },
    { label: 'Pendapatan Bulan', value: formatCurrency(stats?.revenueMonth || 0), icon: DollarSign, color: 'from-green-500 to-emerald-400', glow: 'shadow-green-500/20' },
    { label: 'Order Hari Ini', value: String(stats?.totalOrders || 0), icon: ShoppingCart, color: 'from-orange-500 to-amber-400', glow: 'shadow-orange-500/20' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-[var(--color-text-muted)] text-sm mt-1">Ringkasan penjualan toko</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`stat-card ${card.glow}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[var(--color-text-muted)]">{card.label}</p>
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg ${card.glow}`}>
                <card.icon size={20} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Grafik Pendapatan (7 Hari)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats?.revenueChart || []}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value: number) => [formatCurrency(value), 'Pendapatan']}
              />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Order Chart */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Grafik Order (7 Hari)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats?.orderChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Produk Terlaris</h3>
          <div className="space-y-3">
            {(stats?.topProducts || []).slice(0, 5).map((p: any, i: number) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' : 'bg-[var(--color-surface-lighter)] text-[var(--color-text-muted)]'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">{p.qty} terjual</p>
                </div>
                <p className="text-sm font-semibold text-[var(--color-primary-400)]">{formatCurrency(p.revenue)}</p>
              </div>
            ))}
            {(!stats?.topProducts || stats.topProducts.length === 0) && (
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">Belum ada data</p>
            )}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-[var(--color-accent-400)]" />
            <h3 className="font-semibold">Jam Ramai</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.peakHours || []}>
              <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(h) => `${h}:00`}
              />
              <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
