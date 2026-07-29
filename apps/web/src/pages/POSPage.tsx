import { Capacitor } from '@capacitor/core';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCartStore } from '../stores/cart.store';
import { useAuthStore } from '../stores/auth.store';
import { formatCurrency, getProductImageUrl } from '../lib/utils';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard,
  Loader2, X, Printer, CheckCircle2, Bluetooth, Wifi,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isBLESupported, isPrinterConnected, connectPrinter,
  ensureDesktopPrinterConnected, getSavedDesktopPrinterName,
  printReceipt, printKitchenTicket, type ReceiptData,
} from '../lib/bluetooth-printer';
import {
  isNativePrinterConnected, connectNativePrinter, ensureNativePrinterConnected,
  getSavedPrinterName, forgetSavedPrinter,
  nativePrintReceipt, nativePrintKitchenTicket,
  type ReceiptData as NativeReceiptData,
} from '../lib/native-ble-printer';
import { generateReceiptText } from '../lib/receipt-text';
import {
  offlineDB, cacheProducts, cacheCategories, getLocalProducts, getLocalCategories
} from '../lib/offline-db';
import { useSyncStore } from '../stores/sync.store';

interface ProductVariantData {
  id: string;
  productId: string;
  name: string;
  additionalPrice: string;
  createdAt: string;
}

interface ProductData {
  id: string;
  name: string;
  price: string;
  stock: number;
  barcode: string | null;
  image: string | null;
  categoryId: string | null;
  isActive: boolean;
  variants?: ProductVariantData[];
}

interface CategoryData {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export default function POSPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [variantSelectionProduct, setVariantSelectionProduct] = useState<ProductData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const [printing, setPrinting] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { items, addItem, removeItem, incrementQty, decrementQty, clearCart, getSubtotal } = useCartStore();
  const { user } = useAuthStore();

  const [optionModalProduct, setOptionModalProduct] = useState<ProductData | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, { id?: string; name: string; price: number }[]>>({});

  const { data: optionGroupsRes } = useQuery({
    queryKey: ['category-option-groups'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: any[] }>('/category-option-groups');
        return res;
      } catch {
        return { data: [] };
      }
    },
  });
  const allOptionGroups = optionGroupsRes?.data || [];

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: ProductData[] }>('/products');
        if (res.data) {
          cacheProducts(res.data as any);
        }
        return res;
      } catch (err) {
        console.warn('Offline mode: Loading products from IndexedDB');
        const local = await getLocalProducts();
        return { data: local as unknown as ProductData[] };
      }
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: CategoryData[] }>('/categories');
        if (res.data) {
          cacheCategories(res.data as any);
        }
        return res;
      } catch (err) {
        console.warn('Offline mode: Loading categories from IndexedDB');
        const local = await getLocalCategories();
        return { data: local as unknown as CategoryData[] };
      }
    },
  });

  const products = productsData?.data || [];
  const categories = categoriesData?.data || [];
  const subtotal = getSubtotal();

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (!p.isActive) return false;
    if (selectedCategory && p.categoryId !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode?.includes(q)
      );
    }
    return true;
  });

  // Barcode scan handler — scanner sends chars + Enter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && search && searchRef.current === document.activeElement) {
        const product = products.find((p) => p.barcode === search);
        if (product) {
          addItem({ id: product.id, name: product.name, price: Number(product.price) });
          setSearch('');
          toast.success(`${product.name} ditambahkan`);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [search, products, addItem]);

  // --- Bluetooth Print Handler ---
  const handleBluetoothPrint = async () => {
    if (!lastTransaction) return;
    setPrinting(true);
    try {
      const receiptData: ReceiptData = {
        storeName: "D'Mac Chicken Crunch",
        invoiceNo: lastTransaction.invoiceNo || '-',
        cashierName: user?.name || 'Kasir',
        items: (lastTransaction.items || items).map((i: any) => ({
          name: i.productName || i.name,
          qty: i.qty,
          price: Number(i.price),
          variantName: i.variantName,
        })),
        subtotal: Number(lastTransaction.total),
        total: Number(lastTransaction.total),
        paidAmount: Number(lastTransaction.paidAmount || lastTransaction.total),
        changeAmount: Number(lastTransaction.changeAmount || 0),
        paymentMethod: lastTransaction.paymentMethod || 'cash',
        date: new Date(),
        paperSize: '80mm',
      };
      await printReceipt(receiptData);
      toast.success('Struk Kasir (80mm) berhasil dicetak!');
    } catch (err: any) {
      console.error('Print error:', err);
      toast.error(err.message || 'Gagal mencetak struk');
    } finally {
      setPrinting(false);
    }
  };

  const handleKitchenPrint = async () => {
    if (!lastTransaction) return;
    setPrinting(true);
    try {
      await printKitchenTicket({
        invoiceNo: lastTransaction.invoiceNo || '-',
        cashierName: user?.name || 'Kasir',
        items: (lastTransaction.items || items).map((i: any) => ({
          name: i.productName || i.name,
          qty: i.qty,
          price: Number(i.price),
          variantName: i.variantName,
        })),
        date: new Date(),
        paperSize: '58mm',
      });
      toast.success('Nota Dapur (58mm/50mm) berhasil dicetak!');
    } catch (err: any) {
      console.error('Print kitchen error:', err);
      toast.error(err.message || 'Gagal mencetak nota dapur');
    } finally {
      setPrinting(false);
    }
  };

  const handlePay = async () => {
    const isOnlinePayment = paymentMethod === 'online';
    const paid = Number(paidAmount);
    if (!isOnlinePayment && paid < subtotal) {
      toast.error('Jumlah bayar kurang!');
      return;
    }
    setPaying(true);

    const isNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    const processOfflineCheckout = async () => {
      const now = new Date();
      const localTxId = 'off_' + Math.random().toString(36).substring(2, 11);
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randStr = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const invoiceNo = `OFF-${dateStr}-${randStr}`;

      const offlineTx = {
        id: localTxId,
        invoiceNo,
        userId: user?.id,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          price: i.price,
          qty: i.qty,
          variantId: i.variantId || null,
          variantName: i.variantName || null,
        })),
        subtotal,
        total: subtotal,
        paidAmount: paid,
        changeAmount: paid - subtotal > 0 ? paid - subtotal : 0,
        paymentMethod: 'cash',
        createdAt: now.toISOString(),
        status: 'pending_sync' as const,
      };

      await offlineDB.pendingTransactions.add(offlineTx);
      await useSyncStore.getState().updatePendingCount();

      setLastTransaction({
        id: localTxId,
        invoiceNo,
        total: subtotal,
        paidAmount: paid,
        changeAmount: paid - subtotal > 0 ? paid - subtotal : 0,
        paymentMethod: 'cash',
        items: items.map(i => ({ productName: i.productName, qty: i.qty, price: i.price, variantName: i.variantName })),
      });

      clearCart();
      setShowPayment(false);
      setShowReceipt(true);
      setPaidAmount('');
      toast.success('Transaksi tersimpan offline! Akan otomatis disinkronkan saat internet terhubung.', { icon: '💾', duration: 4000 });
    };

    if (!isNetworkOnline && !isOnlinePayment) {
      try {
        await processOfflineCheckout();
      } catch (err: any) {
        toast.error('Gagal menyimpan transaksi offline: ' + err.message);
      } finally {
        setPaying(false);
      }
      return;
    }

    try {
      const res = await api.post<{ data: any }>('/transactions', {
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          qty: i.qty,
          price: i.price,
          variantId: i.variantId || null,
          variantName: i.variantName || null,
        })),
        paidAmount: isOnlinePayment ? subtotal : paid,
        discount: 0,
        taxRate: 0,
        paymentMethod: isOnlinePayment ? 'qris' : 'cash',
      });

      const txData = {
        ...res.data,
        items: res.data.items || items.map(i => ({ productName: i.productName, qty: i.qty, price: i.price, variantName: i.variantName || null })),
      };

      if (isOnlinePayment && res.data.midtransSnapToken) {
        // Try Snap popup first
        if ((window as any).snap) {
          (window as any).snap.pay(res.data.midtransSnapToken, {
            onSuccess: (result: any) => {
              console.log('Midtrans Success:', result);
              setLastTransaction(txData);
              clearCart();
              setShowPayment(false);
              setShowReceipt(true);
              setPaidAmount('');
              toast.success('Pembayaran Online Berhasil!');
              qc.invalidateQueries({ queryKey: ['products'] });
            },
            onPending: (result: any) => {
              console.log('Midtrans Pending:', result);
              setLastTransaction(txData);
              clearCart();
              setShowPayment(false);
              setPaidAmount('');
              toast.success('Menunggu Pembayaran Online...');
              qc.invalidateQueries({ queryKey: ['products'] });
            },
            onError: (result: any) => {
              console.error('Midtrans Error:', result);
              toast.error('Pembayaran Online Gagal!');
            },
            onClose: () => {
              console.log('Midtrans Closed');
              toast('Pembayaran ditutup. Hubungi admin jika sudah bayar.', { icon: '⚠️' });
            }
          });
        } else if (res.data.snapRedirectUrl) {
          // Fallback: open payment page in external browser (works in Tauri)
          window.open(res.data.snapRedirectUrl, '_blank');
          setLastTransaction(txData);
          clearCart();
          setShowPayment(false);
          setPaidAmount('');
          toast.success('Halaman pembayaran dibuka di browser. Selesaikan pembayaran di sana.');
          qc.invalidateQueries({ queryKey: ['products'] });
        } else {
          toast.error('Gagal memuat halaman pembayaran Midtrans!');
        }
      } else {
        setLastTransaction(txData);
        clearCart();
        setShowPayment(false);
        setShowReceipt(true);
        setPaidAmount('');
        toast.success('Transaksi berhasil!');
        qc.invalidateQueries({ queryKey: ['products'] });
      }
    } catch (err: any) {
      if (!isOnlinePayment && (err.message?.includes('fetch') || err.message?.includes('network') || !navigator.onLine)) {
        console.warn('Network error during checkout, falling back to offline checkout');
        await processOfflineCheckout();
      } else {
        toast.error(err.message || 'Transaksi gagal');
      }
    } finally {
      setPaying(false);
    }
  };

  const handleProductClick = (product: ProductData) => {
    // Stock check
    if (Number(product.stock) <= 0) {
      toast.error(`Stok "${product.name}" habis!`, { icon: '⚠️' });
      return;
    }

    // Check if already in cart and would exceed stock
    const existingInCart = items.filter(i => i.productId === product.id).reduce((sum, i) => sum + i.qty, 0);
    if (existingInCart >= Number(product.stock)) {
      toast.error(`Stok "${product.name}" tidak cukup. Sisa: ${Number(product.stock) - existingInCart + items.find(i => i.productId === product.id)!?.qty || 0}`, { icon: '⚠️' });
      return;
    }

    const categoryGroups = allOptionGroups.filter(g => g.categoryId === product.categoryId);
    if (categoryGroups.length > 0) {
      setOptionModalProduct(product);
      const init: Record<string, { id?: string; name: string; price: number }[]> = {};
      categoryGroups.forEach(g => {
        init[g.id] = [];
      });
      setSelectedOptions(init);
    } else if (product.variants && product.variants.length > 0) {
      setVariantSelectionProduct(product);
    } else {
      addItem({ id: product.id, name: product.name, price: Number(product.price) });
      toast.success(`${product.name} +1`, { duration: 1000, icon: '🛒' });
    }
  };

  const quickAmounts = [subtotal, Math.ceil(subtotal / 10000) * 10000, Math.ceil(subtotal / 50000) * 50000, 100000, 200000, 500000].filter((v, i, a) => v >= subtotal && a.indexOf(v) === i).slice(0, 6);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-5rem)] relative pb-20 lg:pb-0">
      {/* LEFT — Products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search + Categories */}
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
              placeholder="Cari produk atau scan barcode..."
              autoFocus
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`btn btn-sm shrink-0 ${!selectedCategory ? 'btn-primary' : 'btn-secondary'}`}
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`btn btn-sm shrink-0 ${selectedCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto max-h-[60vh] lg:max-h-none pr-1">
          {productsLoading ? (
            <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {filteredProducts.map((product) => {
                const isOutOfStock = Number(product.stock) <= 0;
                return (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  disabled={isOutOfStock}
                  className={`glass-card p-3 sm:p-4 text-left transition-colors group flex flex-col justify-between h-full ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--color-primary-500)]'}`}
                >
                  <div>
                    <div className="w-full h-20 sm:h-24 rounded-lg bg-[var(--color-surface)] mb-2 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform overflow-hidden relative">
                      {product.image ? (
                        <img src={getProductImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                      ) : '📦'}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                          <span className="text-red-400 font-bold text-xs">HABIS</span>
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-xs sm:text-sm line-clamp-2 leading-tight">{product.name}</p>
                  </div>
                  <div className="mt-2">
                    <p className="text-[var(--color-primary-400)] font-semibold text-xs sm:text-sm">
                      {formatCurrency(Number(product.price))}
                    </p>
                    <p className={`text-[10px] sm:text-[11px] ${isOutOfStock ? 'text-red-400 font-semibold' : 'text-[var(--color-text-dim)]'}`}>Stok: {product.stock}</p>
                  </div>
                </button>
              )})}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Desktop Cart */}
      <div className="hidden lg:flex w-[380px] flex-col glass-card shrink-0">
        <div className="flex items-center gap-2 p-4 border-b border-[var(--color-border)]">
          <ShoppingCart size={20} className="text-[var(--color-primary-400)]" />
          <h2 className="font-semibold text-lg">Keranjang</h2>
          <span className="ml-auto badge badge-info">{items.length} item</span>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center text-[var(--color-text-dim)] py-12">
              <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keranjang kosong</p>
              <p className="text-xs mt-1">Klik produk untuk menambahkan</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.cartItemId} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                  <p className="text-[var(--color-primary-400)] text-xs">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => decrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-sm">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                  <button onClick={() => incrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-sm">
                    <Plus size={14} />
                  </button>
                </div>
                <p className="font-semibold text-sm w-20 text-right">{formatCurrency(item.subtotal)}</p>
                <button onClick={() => removeItem(item.cartItemId)} className="text-[var(--color-text-dim)] hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals + Pay button */}
        <div className="p-4 border-t border-[var(--color-border)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[var(--color-text-muted)]">Subtotal</span>
            <span className="font-bold text-xl gradient-text">{formatCurrency(subtotal)}</span>
          </div>
          <button
            onClick={() => {
              if (items.length === 0) { toast.error('Keranjang kosong!'); return; }
              setShowPayment(true);
              setPaymentMethod('cash');
              setPaidAmount(String(subtotal));
            }}
            className="btn btn-success w-full btn-lg"
            disabled={items.length === 0}
          >
            <CreditCard size={20} />
            Bayar
          </button>
        </div>
      </div>

      {/* MOBILE — Floating Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-[var(--color-surface-light)] border-t border-[var(--color-border)] z-30 shadow-2xl flex items-center justify-between gap-2 backdrop-blur-md">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowMobileCart(true)}>
          <div className="relative">
            <ShoppingCart size={22} className="text-[var(--color-primary-400)]" />
            {items.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {items.length}
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-[var(--color-text-dim)]">{items.length} Item</p>
            <p className="font-bold text-xs text-[var(--color-primary-400)]">{formatCurrency(subtotal)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMobileCart(true)}
            className="btn btn-secondary btn-sm text-xs"
          >
            Keranjang
          </button>
          <button
            onClick={() => {
              if (items.length === 0) { toast.error('Keranjang kosong!'); return; }
              setShowPayment(true);
              setPaymentMethod('cash');
              setPaidAmount(String(subtotal));
            }}
            disabled={items.length === 0}
            className="btn btn-success btn-sm text-xs"
          >
            <CreditCard size={14} /> Bayar
          </button>
        </div>
      </div>

      {/* MOBILE — Full Cart Drawer Modal */}
      {showMobileCart && (
        <div className="modal-overlay lg:hidden" onClick={() => setShowMobileCart(false)}>
          <div className="modal-content w-full max-w-md h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-[var(--color-primary-400)]" />
                <h3 className="font-bold text-base">Keranjang Belanja</h3>
                <span className="badge badge-info">{items.length} item</span>
              </div>
              <button onClick={() => setShowMobileCart(false)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {items.length === 0 ? (
                <div className="text-center text-[var(--color-text-dim)] py-12">
                  <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Keranjang kosong</p>
                  <p className="text-xs mt-1">Pilih produk untuk menambahkan</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.cartItemId} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                      <p className="text-[var(--color-primary-400)] text-[11px]">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => decrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-sm">
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{item.qty}</span>
                      <button onClick={() => incrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-sm">
                        <Plus size={12} />
                      </button>
                    </div>
                    <p className="font-semibold text-xs text-right min-w-16">{formatCurrency(item.subtotal)}</p>
                    <button onClick={() => removeItem(item.cartItemId)} className="text-[var(--color-text-dim)] hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--color-text-muted)]">Subtotal</span>
                <span className="font-bold text-lg gradient-text">{formatCurrency(subtotal)}</span>
              </div>
              <button
                onClick={() => {
                  if (items.length === 0) { toast.error('Keranjang kosong!'); return; }
                  setShowMobileCart(false);
                  setShowPayment(true);
                  setPaymentMethod('cash');
                  setPaidAmount(String(subtotal));
                }}
                disabled={items.length === 0}
                className="btn btn-success w-full btn-lg text-sm"
              >
                <CreditCard size={18} />
                Lanjut ke Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Pilih Metode Pembayaran</h3>
              <button onClick={() => setShowPayment(false)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>

            {/* Pilihan Metode */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`btn flex-grow ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Tunai (Cash)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('online')}
                className={`btn flex-grow ${paymentMethod === 'online' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Wifi size={16} /> Online (Midtrans)
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-sm text-[var(--color-text-muted)]">Total Tagihan</p>
              <p className="text-3xl font-bold gradient-text">{formatCurrency(subtotal)}</p>
            </div>

            {paymentMethod === 'online' ? (
              <div className="text-center p-6 border border-dashed border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
                <p className="text-sm font-semibold text-orange-400 mb-2">Pembayaran Online Terpilih</p>
                <p className="text-xs text-[var(--color-text-dim)]">Setelah klik konfirmasi, halaman pembayaran Midtrans akan muncul.</p>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">Tersedia: QRIS, GoPay, ShopeePay, Transfer Bank, Kartu Kredit, dll.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">Jumlah Bayar</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="input text-center text-2xl font-bold"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  {quickAmounts.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setPaidAmount(String(amount))}
                      className="btn btn-secondary btn-sm"
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>

                {Number(paidAmount) >= subtotal && (
                  <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">Kembalian</p>
                    <p className="text-2xl font-bold text-green-400">
                      {formatCurrency(Number(paidAmount) - subtotal)}
                    </p>
                  </div>
                )}
              </>
            )}

            <button
              onClick={handlePay}
              disabled={paying || (paymentMethod === 'cash' && Number(paidAmount) < subtotal) || (paymentMethod === 'online' && subtotal < 100)}
              className="btn btn-success w-full btn-lg mt-6"
            >
              {paying ? <Loader2 size={20} className="animate-spin" /> : (
                <>
                  <CheckCircle2 size={20} />
                  Konfirmasi Pembayaran
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastTransaction && (
        <div className="modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="modal-content text-center" onClick={(e) => e.stopPropagation()}>
            <CheckCircle2 size={64} className="mx-auto text-green-400 mb-4" />
            <h3 className="text-xl font-bold mb-1">Transaksi Berhasil!</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">{lastTransaction.invoiceNo}</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-lg bg-[var(--color-surface)]">
                <p className="text-xs text-[var(--color-text-dim)]">Total</p>
                <p className="font-bold">{formatCurrency(Number(lastTransaction.total))}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-surface)]">
                <p className="text-xs text-[var(--color-text-dim)]">Kembalian</p>
                <p className="font-bold text-green-400">{formatCurrency(Number(lastTransaction.changeAmount))}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {Capacitor.isNativePlatform() ? (
                /* --- MOBILE (Capacitor) — Native BLE Printing --- */
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setPrinting(true);
                      try {
                        await nativePrintReceipt({
                          storeName: "D'Mac Chicken Crunch",
                          invoiceNo: lastTransaction.invoiceNo || '-',
                          cashierName: user?.name || 'Kasir',
                          items: (lastTransaction.items || items).map((i: any) => ({
                            name: i.productName || i.name,
                            qty: i.qty,
                            price: Number(i.price),
                            variantName: i.variantName,
                          })),
                          subtotal: Number(lastTransaction.total),
                          total: Number(lastTransaction.total),
                          paidAmount: Number(lastTransaction.paidAmount || lastTransaction.total),
                          changeAmount: Number(lastTransaction.changeAmount || 0),
                          paymentMethod: lastTransaction.paymentMethod || 'cash',
                          date: new Date(),
                          paperSize: '80mm',
                        });
                        toast.success('Struk Kasir berhasil dicetak!', { icon: '🖨️' });
                      } catch (err: any) {
                        console.error('Native BLE print error:', err);
                        toast.error(err.message || 'Gagal mencetak. Pastikan Printer Kasir terhubung di Settings.');
                      } finally {
                        setPrinting(false);
                      }
                    }}
                    disabled={printing}
                    className="btn btn-primary text-xs py-3 font-semibold"
                  >
                    {printing ? <Loader2 size={14} className="animate-spin" /> : <><Bluetooth size={14} /> Struk Kasir</>}
                  </button>
                  <button
                    onClick={async () => {
                      setPrinting(true);
                      try {
                        await nativePrintKitchenTicket({
                          invoiceNo: lastTransaction.invoiceNo || '-',
                          cashierName: user?.name || 'Kasir',
                          items: (lastTransaction.items || items).map((i: any) => ({
                            name: i.productName || i.name,
                            qty: i.qty,
                            price: Number(i.price),
                            variantName: i.variantName,
                          })),
                          date: new Date(),
                          paperSize: '58mm',
                        });
                        toast.success('Nota Dapur berhasil dicetak!', { icon: '🖨️' });
                      } catch (err: any) {
                        console.error('Native BLE kitchen print error:', err);
                        toast.error(err.message || 'Gagal mencetak. Pastikan Printer Dapur terhubung di Settings.');
                      } finally {
                        setPrinting(false);
                      }
                    }}
                    disabled={printing}
                    className="btn btn-secondary text-xs py-3 font-semibold border border-[var(--color-primary-500)]/40"
                  >
                    {printing ? <Loader2 size={14} className="animate-spin" /> : <><Bluetooth size={14} /> Nota Dapur</>}
                  </button>
                </div>
              ) : isBLESupported() ? (
                /* --- DESKTOP (Chrome Web Bluetooth) --- */
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleBluetoothPrint}
                    disabled={printing}
                    className="btn btn-primary text-xs py-3 font-semibold"
                  >
                    {printing ? <Loader2 size={14} className="animate-spin" /> : <><Printer size={14} /> Struk Kasir</>}
                  </button>
                  <button
                    onClick={handleKitchenPrint}
                    disabled={printing}
                    className="btn btn-secondary text-xs py-3 font-semibold border border-[var(--color-primary-500)]/40"
                  >
                    {printing ? <Loader2 size={14} className="animate-spin" /> : <><Printer size={14} /> Nota Dapur</>}
                  </button>
                </div>
              ) : (
                /* --- FALLBACK (no BLE) — clipboard --- */
                <button
                  onClick={async () => {
                    try {
                      const text = generateReceiptText({
                        storeName: "D'Mac Chicken Crunch",
                        invoiceNo: lastTransaction.invoiceNo || '-',
                        cashierName: user?.name || 'Kasir',
                        items: (lastTransaction.items || items).map((i: any) => ({
                          productName: i.productName || i.name,
                          qty: i.qty,
                          price: Number(i.price),
                          variantName: i.variantName,
                        })),
                        total: Number(lastTransaction.total),
                        paidAmount: Number(lastTransaction.paidAmount || lastTransaction.total),
                        changeAmount: Number(lastTransaction.changeAmount || 0),
                        paymentMethod: lastTransaction.paymentMethod || 'cash',
                        date: new Date(),
                      });
                      await navigator.clipboard.writeText(text);
                      toast.success('Struk disalin ke clipboard!', { icon: '📋', duration: 3000 });
                    } catch (err: any) {
                      toast.error('Gagal menyalin struk');
                    }
                  }}
                  className="btn btn-primary w-full"
                >
                  <Printer size={16} /> Salin Struk ke Clipboard
                </button>
              )}
              <button onClick={() => setShowReceipt(false)} className="btn btn-ghost w-full text-xs">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Selection Modal */}
      {variantSelectionProduct && (
        <div className="modal-overlay" onClick={() => setVariantSelectionProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Pilih Varian: {variantSelectionProduct.name}</h3>
              <button onClick={() => setVariantSelectionProduct(null)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-2">
              {/* Normal price option */}
              <button
                onClick={() => {
                  addItem({
                    id: variantSelectionProduct.id,
                    name: variantSelectionProduct.name,
                    price: Number(variantSelectionProduct.price)
                  });
                  toast.success(`${variantSelectionProduct.name} +1`, { duration: 1000, icon: '🛒' });
                  setVariantSelectionProduct(null);
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-500)] text-left"
              >
                <span>Normal</span>
                <span className="font-semibold">{formatCurrency(Number(variantSelectionProduct.price))}</span>
              </button>

              {/* Variant options */}
              {variantSelectionProduct.variants?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    addItem(
                      {
                        id: variantSelectionProduct.id,
                        name: variantSelectionProduct.name,
                        price: Number(variantSelectionProduct.price)
                      },
                      {
                        id: v.id,
                        name: v.name,
                        additionalPrice: Number(v.additionalPrice)
                      }
                    );
                    toast.success(`${variantSelectionProduct.name} (${v.name}) +1`, { duration: 1000, icon: '🛒' });
                    setVariantSelectionProduct(null);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary-500)] text-left"
                >
                  <span>{v.name}</span>
                  <span className="font-semibold">
                    {formatCurrency(Number(variantSelectionProduct.price) + Number(v.additionalPrice))} 
                    <span className="text-xs text-[var(--color-text-dim)] ml-1">
                      (+{formatCurrency(Number(v.additionalPrice))})
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Option Groups Modal */}
      {optionModalProduct && (
        <div className="modal-overlay" onClick={() => setOptionModalProduct(null)}>
          <div className="modal-content max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-lg font-bold">{optionModalProduct.name}</h3>
                <p className="text-xs text-[var(--color-primary-400)] font-semibold">
                  Harga dasar: {formatCurrency(Number(optionModalProduct.price))}
                </p>
              </div>
              <button onClick={() => setOptionModalProduct(null)} className="btn btn-ghost btn-icon"><X size={20} /></button>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {allOptionGroups
                .filter(g => g.categoryId === optionModalProduct.categoryId)
                .map(group => {
                  const currentSelected = selectedOptions[group.id] || [];

                  const toggleOption = (opt: { id?: string; name: string; price: number }) => {
                    setSelectedOptions(prev => {
                      const groupSel = prev[group.id] || [];
                      const exists = groupSel.some(s => s.name === opt.name);

                      if (group.isMultiple) {
                        if (exists) {
                          return { ...prev, [group.id]: groupSel.filter(s => s.name !== opt.name) };
                        } else {
                          if (group.maxSelect > 0 && groupSel.length >= group.maxSelect) {
                            toast.error(`Maksimal ${group.maxSelect} pilihan untuk ${group.name}`);
                            return prev;
                          }
                          return { ...prev, [group.id]: [...groupSel, opt] };
                        }
                      } else {
                        if (exists) {
                          return { ...prev, [group.id]: [] };
                        } else {
                          return { ...prev, [group.id]: [opt] };
                        }
                      }
                    });
                  };

                  return (
                    <div key={group.id} className="glass-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white capitalize">{group.name}</span>
                        <div className="flex gap-1">
                          {group.isRequired && <span className="badge badge-warning text-[10px]">Wajib</span>}
                          {group.isMultiple && <span className="badge badge-info text-[10px]">Pilihan Ganda</span>}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {group.options?.map((opt: any) => {
                          const isChecked = currentSelected.some(s => s.name === opt.name);
                          return (
                            <button
                              key={opt.id || opt.name}
                              type="button"
                              onClick={() => toggleOption({ name: opt.name, price: Number(opt.price) })}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                                isChecked
                                  ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)]/15 text-white'
                                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded flex items-center justify-center border ${isChecked ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white' : 'border-gray-500'}`}>
                                  {isChecked && <CheckCircle2 size={12} />}
                                </div>
                                <span className="text-xs font-medium">{opt.name}</span>
                              </div>
                              <span className="text-xs font-mono text-emerald-400">+Rp {Number(opt.price).toLocaleString('id-ID')}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Total Preview & Add Button */}
            <div className="pt-4 mt-4 border-t border-[var(--color-border)] space-y-3">
              {(() => {
                const groupsForProduct = allOptionGroups.filter(g => g.categoryId === optionModalProduct.categoryId);
                const allSelected = Object.values(selectedOptions).flat();
                const addPrice = allSelected.reduce((sum, item) => sum + item.price, 0);
                const totalPrice = Number(optionModalProduct.price) + addPrice;

                return (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--color-text-muted)]">Total Harga Item</span>
                      <span className="font-bold text-lg text-emerald-400">{formatCurrency(totalPrice)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        // Validation
                        for (const group of groupsForProduct) {
                          const sel = selectedOptions[group.id] || [];
                          if (group.isRequired && sel.length === 0) {
                            toast.error(`Wajib memilih opsi pada "${group.name}"`);
                            return;
                          }
                          if (group.minSelect > 0 && sel.length < group.minSelect) {
                            toast.error(`Pilihan minimum untuk "${group.name}" adalah ${group.minSelect}`);
                            return;
                          }
                        }

                        // Build variant string & add item
                        const variantNames = allSelected.map(s => `${s.name} (+Rp ${s.price.toLocaleString('id-ID')})`).join(', ');

                        addItem(
                          {
                            id: optionModalProduct.id,
                            name: optionModalProduct.name,
                            price: Number(optionModalProduct.price)
                          },
                          allSelected.length > 0 ? {
                            id: 'opt_' + Math.random().toString(36).substring(2, 9),
                            name: variantNames || 'Kustom Opsi',
                            additionalPrice: addPrice
                          } : undefined
                        );

                        toast.success(`${optionModalProduct.name} ditambahkan`, { duration: 1000, icon: '🛒' });
                        setOptionModalProduct(null);
                      }}
                      className="btn btn-primary w-full py-2.5 text-sm font-semibold"
                    >
                      Tambah ke Keranjang ({formatCurrency(totalPrice)})
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
