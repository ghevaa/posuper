// ============================================================
// POS Yoga — App Routing (React Router)
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/auth.store';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import POSHistoryPage from './pages/POSHistoryPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminCategories from './pages/AdminCategories';
import AdminTransactions from './pages/AdminTransactions';
import AdminExpenses from './pages/AdminExpenses';
import AdminStockOpname from './pages/AdminStockOpname';
import AdminUsers from './pages/AdminUsers';
import DevSettings from './pages/DevSettings';
import { Toaster } from 'react-hot-toast';
import UpdateChecker from './components/UpdateChecker';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect based on role
    if (user.role === 'cashier') return <Navigate to="/pos" replace />;
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/dev/settings" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { checkSession } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ className: 'react-hot-toast' }} />
      <UpdateChecker />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Dashboard Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect */}
          <Route index element={<Navigate to="/pos" replace />} />

          {/* Cashier routes */}
          <Route path="pos" element={<POSPage />} />
          <Route path="pos/history" element={<POSHistoryPage />} />

          {/* Admin routes */}
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/products"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/categories"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminCategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/transactions"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminTransactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/expenses"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminExpenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/stock-opname"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminStockOpname />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/reports"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminDashboard /> {/* Fallback to dashboard with stats */}
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/customers"
            element={
              <ProtectedRoute allowedRoles={['admin', 'developer']}>
                <div className="glass-card p-6"><h2 className="font-bold text-lg mb-2">Pelanggan</h2><p className="text-sm text-[var(--color-text-muted)]">Data pelanggan terdaftar</p></div>
              </ProtectedRoute>
            }
          />

          {/* Developer routes */}
          <Route
            path="dev"
            element={
              <ProtectedRoute allowedRoles={['developer']}>
                <Navigate to="/dev/settings" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="dev/settings"
            element={
              <ProtectedRoute allowedRoles={['developer']}>
                <DevSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="dev/backup"
            element={
              <ProtectedRoute allowedRoles={['developer']}>
                <div className="glass-card p-6"><h2 className="font-bold text-lg mb-2">Database Backup</h2><p className="text-sm text-[var(--color-text-muted)]">Silakan jalankan backup script di server atau download file backup.</p></div>
              </ProtectedRoute>
            }
          />
          <Route
            path="dev/logs"
            element={
              <ProtectedRoute allowedRoles={['developer']}>
                <div className="glass-card p-6"><h2 className="font-bold text-lg mb-2">Audit Logs</h2><p className="text-sm text-[var(--color-text-muted)]">Aktivitas sistem tercatat otomatis di server.</p></div>
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
