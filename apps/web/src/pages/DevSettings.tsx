// ============================================================
// POS Yoga — Dev Settings Page
// ============================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Save, Loader2, Printer, Settings, Bluetooth, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import {
  ensureNativePrinterConnectedSlot,
  getSavedPrinterName,
  forgetSavedPrinter,
} from '../lib/native-ble-printer';
import {
  ensureDesktopPrinterConnectedSlot,
  getSavedDesktopPrinterName,
  disconnectPrinterSlot,
} from '../lib/bluetooth-printer';

export default function DevSettings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: settingsRes, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<{ data: Record<string, string> }>('/settings');
      setForm(res.data);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Pengaturan disimpan');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const { data: printersRes } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.get<{ data: any[] }>('/printers'),
  });

  const printers = printersRes?.data || [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="text-purple-500" />
          Pengaturan
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">Ubah pengaturan umum toko & printer</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* General Config Form */}
          <form onSubmit={handleSubmit} className="md:col-span-2 glass-card p-6 space-y-4">
            <h3 className="font-bold text-base border-b border-[var(--color-border)] pb-2">Informasi Toko</h3>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Nama Toko</label>
              <input
                className="input"
                value={form.store_name || ''}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Alamat Toko</label>
              <textarea
                className="input"
                value={form.store_address || ''}
                onChange={(e) => setForm({ ...form, store_address: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">No. Telepon</label>
              <input
                className="input"
                value={form.store_phone || ''}
                onChange={(e) => setForm({ ...form, store_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Header Struk</label>
              <input
                className="input"
                value={form.receipt_header || ''}
                onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1 block">Footer Struk</label>
              <input
                className="input"
                value={form.receipt_footer || ''}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 size={18} className="animate-spin" /> : (
                <>
                  <Save size={16} />
                  Simpan Pengaturan
                </>
              )}
            </button>
          </form>

          {/* Dual Printer Config (Kasir & Dapur) */}
          <div className="glass-card p-6 space-y-6">
            <h3 className="font-bold text-base border-b border-[var(--color-border)] pb-2 flex items-center gap-2">
              <Printer size={18} className="text-cyan-400" />
              Pengaturan Printer (Ter-Lock)
            </h3>

            {/* Printer Kasir Slot */}
            <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    <Printer size={14} className="text-blue-400" />
                    Printer Kasir (Struk)
                  </h4>
                  <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                    {Capacitor.isNativePlatform()
                      ? (getSavedPrinterName('cashier') ? `Terkunci: ${getSavedPrinterName('cashier')}` : 'Belum di-connect')
                      : (getSavedDesktopPrinterName('cashier') ? `Terkunci: ${getSavedDesktopPrinterName('cashier')}` : 'Belum di-connect')}
                  </p>
                </div>
                <span className={`badge ${
                  (Capacitor.isNativePlatform() ? getSavedPrinterName('cashier') : getSavedDesktopPrinterName('cashier'))
                    ? 'badge-success'
                    : 'badge-danger'
                }`}>
                  {(Capacitor.isNativePlatform() ? getSavedPrinterName('cashier') : getSavedDesktopPrinterName('cashier')) ? 'Locked' : 'Off'}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (Capacitor.isNativePlatform()) {
                        const name = await ensureNativePrinterConnectedSlot('cashier', true);
                        toast.success(`Printer Kasir terhubung & terkunci: ${name}`);
                      } else {
                        await ensureDesktopPrinterConnectedSlot('cashier', true);
                        toast.success(`Printer Kasir terhubung & terkunci: ${getSavedDesktopPrinterName('cashier')}`);
                      }
                    } catch (e: any) {
                      toast.error(e.message || 'Gagal terhubung ke printer kasir');
                    }
                  }}
                  className="btn btn-primary text-xs flex-1 py-2"
                >
                  <Bluetooth size={14} /> Connect Printer Kasir
                </button>
                {(Capacitor.isNativePlatform() ? getSavedPrinterName('cashier') : getSavedDesktopPrinterName('cashier')) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        forgetSavedPrinter('cashier');
                      } else {
                        await disconnectPrinterSlot('cashier');
                      }
                      toast.success('Printer Kasir di-unlock');
                    }}
                    className="btn btn-secondary text-xs px-3 py-2 text-rose-400 border-rose-500/30"
                  >
                    Unlock
                  </button>
                )}
              </div>
            </div>

            {/* Printer Dapur Slot */}
            <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    <Utensils size={14} className="text-amber-400" />
                    Printer Dapur (Nota)
                  </h4>
                  <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                    {Capacitor.isNativePlatform()
                      ? (getSavedPrinterName('kitchen') ? `Terkunci: ${getSavedPrinterName('kitchen')}` : 'Belum di-connect')
                      : (getSavedDesktopPrinterName('kitchen') ? `Terkunci: ${getSavedDesktopPrinterName('kitchen')}` : 'Belum di-connect')}
                  </p>
                </div>
                <span className={`badge ${
                  (Capacitor.isNativePlatform() ? getSavedPrinterName('kitchen') : getSavedDesktopPrinterName('kitchen'))
                    ? 'badge-success'
                    : 'badge-danger'
                }`}>
                  {(Capacitor.isNativePlatform() ? getSavedPrinterName('kitchen') : getSavedDesktopPrinterName('kitchen')) ? 'Locked' : 'Off'}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (Capacitor.isNativePlatform()) {
                        const name = await ensureNativePrinterConnectedSlot('kitchen', true);
                        toast.success(`Printer Dapur terhubung & terkunci: ${name}`);
                      } else {
                        await ensureDesktopPrinterConnectedSlot('kitchen', true);
                        toast.success(`Printer Dapur terhubung & terkunci: ${getSavedDesktopPrinterName('kitchen')}`);
                      }
                    } catch (e: any) {
                      toast.error(e.message || 'Gagal terhubung ke printer dapur');
                    }
                  }}
                  className="btn btn-secondary text-xs flex-1 py-2 border-amber-500/40"
                >
                  <Bluetooth size={14} /> Connect Printer Dapur
                </button>
                {(Capacitor.isNativePlatform() ? getSavedPrinterName('kitchen') : getSavedDesktopPrinterName('kitchen')) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (Capacitor.isNativePlatform()) {
                        forgetSavedPrinter('kitchen');
                      } else {
                        await disconnectPrinterSlot('kitchen');
                      }
                      toast.success('Printer Dapur di-unlock');
                    }}
                    className="btn btn-secondary text-xs px-3 py-2 text-rose-400 border-rose-500/30"
                  >
                    Unlock
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
