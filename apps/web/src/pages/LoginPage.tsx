// ============================================================
// POS Yoga — Login Page
// ============================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      toast.success(`Selamat datang, ${user?.name}!`);
      // Route by role
      if (user?.role === 'cashier') navigate('/pos');
      else if (user?.role === 'admin') navigate('/admin');
      else navigate('/dev');
    } catch (err: any) {
      toast.error(err.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px]" />

      <div className="glass-card p-8 w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src="/logo.jpg" 
            alt="D'Mac Chicken Crunch Logo" 
            className="w-24 h-24 mx-auto rounded-3xl object-cover mb-4 shadow-lg border border-[var(--color-border)]"
          />
          <h1 className="text-2xl font-bold gradient-text">D'Mac Chicken Crunch</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Masuk ke akun Anda</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
                placeholder="email@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10 pr-10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full btn-lg"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
