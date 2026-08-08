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
  FileText, Utensils, ShoppingBag, Tag, Edit3, BarChart2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  isBLESupported, isPrinterConnected, connectPrinter,
  ensureDesktopPrinterConnected, getSavedDesktopPrinterName,
  printReceipt, printKitchenTicket, printClosingReport, type ReceiptData,
} from '../lib/bluetooth-printer';
import {
  isNativePrinterConnected, connectNativePrinter, ensureNativePrinterConnected,
  getSavedPrinterName,
  nativePrintReceipt, nativePrintKitchenTicket, nativePrintClosingReport,
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'transfer'>('cash');
  const [printing, setPrinting] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingData, setClosingData] = useState<any>(null);
  const [loadingClosing, setLoadingClosing] = useState(false);
  const [noteItem, setNoteItem] = useState<{ id: string; name: string; note: string } | null>(null);
  
  // Shift & Kas Awal State
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [openShiftAmount, setOpenShiftAmount] = useState('');
  const [drawerAmount, setDrawerAmount] = useState('');
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    items, addItem, removeItem, incrementQty, decrementQty, setItemNote, clearCart,
    orderType, setOrderType, tableNo, setTableNo,
    discountType, discountValue, setDiscount, getSubtotal, getDiscountAmount, getTotal,
    globalNote, setGlobalNote,
  } = useCartStore();
  const { user } = useAuthStore();

  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();
  const grandTotal = getTotal();

  const [optionModalProduct, setOptionModalProduct] = useState<ProductData | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ id?: string; name: string; additionalPrice: number } | null>(null);
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
        const res = await api.get<{ data: ProductData[] }>('/products?limit=1000');
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

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (!p.isActive) return false;
    if (selectedCategory && p.categoryId !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
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

  const { data: settingsRes } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ data: Record<string, string> }>('/settings'),
  });
  const settings = settingsRes?.data || {};

  // --- Bluetooth Print Handler ---
  const handleBluetoothPrint = async () => {
    if (!lastTransaction) return;
    setPrinting(true);
    try {
      const receiptData: ReceiptData = {
        storeName: settings.store_name || "D'Mac Chicken",
        storeAddress: settings.store_address || undefined,
        storePhone: settings.store_phone || undefined,
        receiptHeader: settings.receipt_header || undefined,
        receiptFooter: settings.receipt_footer || undefined,
        invoiceNo: lastTransaction.invoiceNo || '-',
        cashierName: user?.name || 'Kasir',
        items: (lastTransaction.items || items).map((i: any) => ({
          name: i.productName || i.name,
          qty: i.qty,
          price: Number(i.price),
          variantName: i.variantName,
          note: i.note,
        })),
        subtotal: Number(lastTransaction.subtotal || subtotal),
        discount: Number(lastTransaction.discount || discountAmount),
        total: Number(lastTransaction.total || grandTotal),
        paidAmount: Number(lastTransaction.paidAmount || grandTotal),
        changeAmount: Number(lastTransaction.changeAmount || 0),
        paymentMethod: lastTransaction.paymentMethod || paymentMethod,
        orderType: lastTransaction.orderType || orderType,
        tableNo: lastTransaction.tableNo || tableNo,
        note: lastTransaction.note || globalNote,
        date: new Date(),
        paperSize: '80mm',
      };

      if (Capacitor.isNativePlatform()) {
        await nativePrintReceipt(receiptData);
      } else {
        await printReceipt(receiptData);
      }
      toast.success('Struk Kasir berhasil dicetak!');
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
      const ticketData = {
        invoiceNo: lastTransaction.invoiceNo || '-',
        cashierName: user?.name || 'Kasir',
        items: (lastTransaction.items || items).map((i: any) => ({
          name: i.productName || i.name,
          qty: i.qty,
          price: Number(i.price),
          variantName: i.variantName,
          note: i.note,
        })),
        orderType: lastTransaction.orderType || orderType,
        tableNo: lastTransaction.tableNo || tableNo,
        note: lastTransaction.note || globalNote,
        date: new Date(),
        paperSize: '58mm' as const,
      };

      if (Capacitor.isNativePlatform()) {
        await nativePrintKitchenTicket(ticketData);
      } else {
        await printKitchenTicket(ticketData);
      }
      toast.success('Nota Dapur berhasil dicetak!');
    } catch (err: any) {
      console.error('Print kitchen error:', err);
      toast.error(err.message || 'Gagal mencetak nota dapur');
    } finally {
      setPrinting(false);
    }
  };

  const handlePay = async () => {
    const paid = Number(paidAmount);
    if (paymentMethod === 'cash' && paid < grandTotal) {
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
          note: i.note || null,
        })),
        subtotal,
        discount: discountAmount,
        total: grandTotal,
        paidAmount: paymentMethod === 'cash' ? paid : grandTotal,
        changeAmount: paymentMethod === 'cash' ? (paid - grandTotal > 0 ? paid - grandTotal : 0) : 0,
        paymentMethod,
        orderType,
        tableNo: orderType === 'dine_in' ? tableNo : null,
        note: globalNote || null,
        createdAt: now.toISOString(),
        status: 'pending_sync' as const,
      };

      await offlineDB.pendingTransactions.add(offlineTx);
      await useSyncStore.getState().updatePendingCount();

      setLastTransaction(offlineTx);

      clearCart();
      setShowPayment(false);
      setShowReceipt(true);
      setPaidAmount('');
      toast.success('Transaksi tersimpan offline!', { icon: '💾', duration: 4000 });
    };

    if (!isNetworkOnline) {
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
          note: i.note || null,
        })),
        subtotal,
        discount: discountAmount,
        taxRate: 0,
        paidAmount: paymentMethod === 'cash' ? paid : grandTotal,
        paymentMethod,
        orderType,
        tableNo: orderType === 'dine_in' ? tableNo : null,
        note: globalNote || null,
      });

      const txData = {
        ...res.data,
        items: res.data.items || items.map(i => ({ productName: i.productName, qty: i.qty, price: i.price, variantName: i.variantName || null, note: i.note || null })),
      };

      setLastTransaction(txData);
      clearCart();
      setShowPayment(false);
      setShowReceipt(true);
      setPaidAmount('');
      toast.success('Transaksi berhasil!');
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err: any) {
      if (err.message?.includes('fetch') || err.message?.includes('network') || !navigator.onLine) {
        console.warn('Network error during checkout, falling back to offline checkout');
        await processOfflineCheckout();
      } else {
        toast.error(err.message || 'Transaksi gagal');
      }
    } finally {
      setPaying(false);
    }
  };

  // Check shift status on mount
  useEffect(() => {
    checkShiftStatus();
  }, []);

  const checkShiftStatus = async () => {
    try {
      const res = await api.get<{ data: any }>('/shifts/current');
      if (!res.data) {
        setShowOpenShiftModal(true);
      } else {
        setCurrentShift(res.data);
      }
    } catch {
      // Ignore
    }
  };

  const handleOpenShift = async () => {
    setOpeningShift(true);
    try {
      const amt = Number(openShiftAmount.replace(/\D/g, '')) || 0;
      const res = await api.post<{ data: any }>('/shifts/open', { openAmount: amt });
      if (res.data) {
        setCurrentShift(res.data);
        setShowOpenShiftModal(false);
        toast.success('Shift berhasil dibuka! Kas awal: ' + formatCurrency(amt));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membuka shift');
    } finally {
      setOpeningShift(false);
    }
  };

  const handleFetchClosing = async () => {
    setLoadingClosing(true);
    try {
      const res = await api.get<{ data: any }>('/shifts/current-summary');
      setClosingData(res.data);
      setDrawerAmount(String(res.data.expectedAmount || 0));
      setShowClosingModal(true);
    } catch (err: any) {
      toast.error('Gagal memuat rekap closing');
    } finally {
      setLoadingClosing(false);
    }
  };

  const handleConfirmCloseShift = async () => {
    if (!closingData?.shiftId) {
      setShowClosingModal(false);
      return;
    }
    setClosingShift(true);
    try {
      const closeAmt = Number(drawerAmount.replace(/\D/g, '')) || 0;
      await api.post(`/shifts/${closingData.shiftId}/close`, { closeAmount: closeAmt });
      toast.success('Shift kasir berhasil ditutup!');
      setShowClosingModal(false);
      setShowOpenShiftModal(true);
      setOpenShiftAmount('');
      setCurrentShift(null);
    } catch (err: any) {
      toast.error('Gagal menutup shift: ' + (err.response?.data?.error || err.message));
    } finally {
      setClosingShift(false);
    }
  };

  const handlePrintClosing = async () => {
    if (!closingData) return;
    try {
      const actualDrawer = Number(drawerAmount.replace(/\D/g, '')) || 0;
      const diff = actualDrawer - (closingData.expectedAmount || 0);

      const reportPayload = {
        storeName: "D'Mac Chicken Crunch",
        cashierName: user?.name || 'Kasir',
        date: new Date(),
        totalTxCount: closingData.totalTxCount,
        totalOmset: closingData.totalSales || closingData.totalOmset,
        totalCash: closingData.totalCashSales || closingData.totalCash,
        totalQris: closingData.totalQris || 0,
        totalTransfer: closingData.totalTransfer || 0,
        totalNonCash: closingData.totalNonCash || 0,
        totalDiscount: closingData.totalDiscount || 0,
        openAmount: closingData.openAmount || 0,
        totalExpenses: closingData.totalExpenses || 0,
        expectedAmount: closingData.expectedAmount || 0,
        closeAmount: actualDrawer,
        difference: diff,
        paperSize: '58mm' as const,
      };

      if (Capacitor.isNativePlatform()) {
        await nativePrintClosingReport(reportPayload);
      } else {
        await printClosingReport(reportPayload);
      }
      toast.success('Struk Rekap Closing Kasir berhasil dicetak!');
    } catch (err: any) {
      toast.error('Gagal mencetak rekap closing: ' + err.message);
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
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;

    if (categoryGroups.length > 0 || hasVariants) {
      setOptionModalProduct(product);
      setSelectedVariant(null);
      const init: Record<string, { id?: string; name: string; price: number }[]> = {};
      categoryGroups.forEach(g => {
        init[g.id] = [];
      });
      setSelectedOptions(init);
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
        {/* Search + Categories + Closing Kasir Button */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
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
            <button
              type="button"
              onClick={handleFetchClosing}
              disabled={loadingClosing}
              className="btn btn-secondary btn-md shrink-0 flex items-center gap-1.5 font-bold text-xs"
            >
              {loadingClosing ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} className="text-orange-400" />}
              <span>Closing Kasir</span>
            </button>
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
      <div className="hidden lg:flex w-[400px] flex-col glass-card shrink-0">
        {/* Cart Header */}
        <div className="flex items-center gap-2 p-3 border-b border-[var(--color-border)]">
          <ShoppingCart size={18} className="text-[var(--color-primary-400)]" />
          <h2 className="font-semibold text-base">Keranjang</h2>
          <span className="ml-auto badge badge-info">{items.length} item</span>
        </div>

        {/* Tipe Pesanan Selector */}
        <div className="p-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] space-y-2">
          <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">Tipe Pesanan</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrderType('dine_in')}
              className={`btn flex-1 btn-xs py-1.5 font-bold ${orderType === 'dine_in' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Utensils size={13} /> Makan di tempat
            </button>
            <button
              type="button"
              onClick={() => setOrderType('take_away')}
              className={`btn flex-1 btn-xs py-1.5 font-bold ${orderType === 'take_away' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <ShoppingBag size={13} /> Bawa pulang
            </button>
          </div>
          {orderType === 'dine_in' && (
            <input
              type="text"
              placeholder="Nomor Meja (misal: 04)"
              value={tableNo}
              onChange={(e) => setTableNo(e.target.value)}
              className="input input-sm w-full text-xs"
            />
          )}
        </div>

        {/* Cart items list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-center text-[var(--color-text-dim)] py-12">
              <ShoppingCart size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Keranjang kosong</p>
              <p className="text-[11px] mt-0.5">Klik produk untuk menambahkan</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.cartItemId} className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs truncate">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                    <p className="text-[var(--color-primary-400)] text-[11px]">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => decrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-xs">
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center text-xs font-semibold">{item.qty}</span>
                    <button onClick={() => incrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-xs">
                      <Plus size={12} />
                    </button>
                  </div>
                  <p className="font-semibold text-xs text-right min-w-16">{formatCurrency(item.subtotal)}</p>
                  <button onClick={() => removeItem(item.cartItemId)} className="text-[var(--color-text-dim)] hover:text-red-400 p-0.5">
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Per-Item Note row */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-border)]/50">
                  <Edit3 size={11} className="text-[var(--color-text-dim)] shrink-0" />
                  <input
                    type="text"
                    placeholder="Tambah catatan item..."
                    value={item.note || ''}
                    onChange={(e) => setItemNote(item.cartItemId, e.target.value)}
                    className="bg-transparent text-[11px] text-orange-400 placeholder-[var(--color-text-dim)] w-full outline-none"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Global Note & Discount Inputs */}
        {items.length > 0 && (
          <div className="p-3 border-t border-[var(--color-border)] space-y-2 bg-[var(--color-surface)]">
            <div>
              <label className="text-[11px] font-semibold text-[var(--color-text-muted)] block mb-1">Catatan Pesanan</label>
              <input
                type="text"
                placeholder="Tulis catatan pesanan..."
                value={globalNote}
                onChange={(e) => setGlobalNote(e.target.value)}
                className="input input-sm w-full text-xs"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-semibold text-[var(--color-text-muted)]">Diskon</label>
                <div className="flex items-center gap-0.5 bg-[var(--color-surface-light)] rounded p-0.5 border border-[var(--color-border)]">
                  <button
                    type="button"
                    onClick={() => setDiscount(discountValue, 'fixed')}
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${discountType === 'fixed' ? 'bg-blue-600 text-white' : 'text-[var(--color-text-dim)]'}`}
                  >
                    Rp
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscount(discountValue, 'percent')}
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${discountType === 'percent' ? 'bg-blue-600 text-white' : 'text-[var(--color-text-dim)]'}`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                type="number"
                placeholder="0"
                value={discountValue || ''}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="input input-sm w-full text-xs font-bold text-emerald-400"
              />
            </div>
          </div>
        )}

        {/* Totals + Pay button */}
        <div className="p-3.5 border-t border-[var(--color-border)] space-y-2">
          <div className="flex justify-between items-center text-xs text-[var(--color-text-muted)]">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-xs text-emerald-400 font-semibold">
              <span>Diskon</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-[var(--color-border)]">
            <span className="text-sm font-semibold">Total Tagihan</span>
            <span className="font-bold text-xl gradient-text">{formatCurrency(grandTotal)}</span>
          </div>
          <button
            onClick={() => {
              if (items.length === 0) { toast.error('Keranjang kosong!'); return; }
              setShowPayment(true);
              setPaymentMethod('cash');
              setPaidAmount(String(grandTotal));
            }}
            className="btn btn-success w-full btn-lg mt-1 text-sm font-bold"
            disabled={items.length === 0}
          >
            <CreditCard size={18} />
            Bayar ({formatCurrency(grandTotal)})
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
            <p className="font-bold text-xs text-[var(--color-primary-400)]">{formatCurrency(grandTotal)}</p>
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
              setPaidAmount(String(grandTotal));
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
          <div className="modal-content w-full max-w-md h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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

            {/* Mobile Tipe Pesanan */}
            <div className="p-2.5 my-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType('dine_in')}
                  className={`btn flex-1 btn-xs py-1.5 font-bold ${orderType === 'dine_in' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Utensils size={13} /> Makan di tempat
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('take_away')}
                  className={`btn flex-1 btn-xs py-1.5 font-bold ${orderType === 'take_away' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <ShoppingBag size={13} /> Bawa pulang
                </button>
              </div>
              {orderType === 'dine_in' && (
                <input
                  type="text"
                  placeholder="Nomor Meja (misal: 04)"
                  value={tableNo}
                  onChange={(e) => setTableNo(e.target.value)}
                  className="input input-sm w-full text-xs"
                />
              )}
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2">
              {items.length === 0 ? (
                <div className="text-center text-[var(--color-text-dim)] py-12">
                  <ShoppingCart size={44} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Keranjang kosong</p>
                  <p className="text-xs mt-1">Pilih produk untuk menambahkan</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.cartItemId} className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                        <p className="text-[var(--color-primary-400)] text-[11px]">{formatCurrency(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => decrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-xs">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold">{item.qty}</span>
                        <button onClick={() => incrementQty(item.cartItemId)} className="btn btn-ghost btn-icon btn-xs">
                          <Plus size={12} />
                        </button>
                      </div>
                      <p className="font-semibold text-xs text-right min-w-16">{formatCurrency(item.subtotal)}</p>
                      <button onClick={() => removeItem(item.cartItemId)} className="text-[var(--color-text-dim)] hover:text-red-400 p-0.5">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {/* Per-Item Note row */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-border)]/50">
                      <Edit3 size={11} className="text-[var(--color-text-dim)] shrink-0" />
                      <input
                        type="text"
                        placeholder="Tambah catatan item..."
                        value={item.note || ''}
                        onChange={(e) => setItemNote(item.cartItemId, e.target.value)}
                        className="bg-transparent text-[11px] text-orange-400 placeholder-[var(--color-text-dim)] w-full outline-none"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Mobile Footer with Notes & Discount */}
            {items.length > 0 && (
              <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
                <input
                  type="text"
                  placeholder="Tulis catatan pesanan..."
                  value={globalNote}
                  onChange={(e) => setGlobalNote(e.target.value)}
                  className="input input-sm w-full text-xs"
                />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs text-[var(--color-text-muted)]">Diskon</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      placeholder="0"
                      value={discountValue || ''}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="input input-sm w-24 text-xs font-bold text-emerald-400 text-right"
                    />
                    <button
                      type="button"
                      onClick={() => setDiscount(discountValue, discountType === 'fixed' ? 'percent' : 'fixed')}
                      className="btn btn-secondary btn-xs font-bold"
                    >
                      {discountType === 'fixed' ? 'Rp' : '%'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-[var(--color-border)]">
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">Total</span>
                  <span className="font-bold text-lg gradient-text">{formatCurrency(grandTotal)}</span>
                </div>
                <button
                  onClick={() => {
                    if (items.length === 0) { toast.error('Keranjang kosong!'); return; }
                    setShowMobileCart(false);
                    setShowPayment(true);
                    setPaymentMethod('cash');
                    setPaidAmount(String(grandTotal));
                  }}
                  disabled={items.length === 0}
                  className="btn btn-success w-full btn-lg text-sm font-bold"
                >
                  <CreditCard size={18} />
                  Lanjut ke Pembayaran ({formatCurrency(grandTotal)})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Pilih Metode Pembayaran</h3>
              <button onClick={() => setShowPayment(false)} className="btn btn-ghost btn-icon">
                <X size={20} />
              </button>
            </div>

            {/* Metode Pembayaran Selection */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`btn btn-sm font-bold ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
              >
                💵 Tunai
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('qris');
                  setPaidAmount(String(grandTotal));
                }}
                className={`btn btn-sm font-bold ${paymentMethod === 'qris' ? 'btn-primary' : 'btn-secondary'}`}
              >
                📱 QRIS
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('transfer');
                  setPaidAmount(String(grandTotal));
                }}
                className={`btn btn-sm font-bold ${paymentMethod === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
              >
                🏦 Transfer
              </button>
            </div>

            {/* Subtotal & Diskon Section */}
            <div className="bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] mb-4 space-y-2">
              <div className="flex justify-between items-center text-xs text-[var(--color-text-muted)]">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>

              <div className="flex justify-between items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-muted)]">Diskon</span>
                  {discountType === 'percent' && discountValue > 0 && (
                    <span className="text-[11px] text-emerald-400 font-bold">
                      ({discountValue}% = -{formatCurrency(discountAmount)})
                    </span>
                  )}
                  {discountType === 'fixed' && discountAmount > 0 && (
                    <span className="text-[11px] text-emerald-400 font-bold">
                      (-{formatCurrency(discountAmount)})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="0"
                    value={discountValue || ''}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value));
                      setDiscount(val, discountType);
                      const newDisc = discountType === 'percent'
                        ? Math.min(subtotal, Math.round((subtotal * val) / 100))
                        : Math.min(subtotal, val);
                      const newTotal = Math.max(0, subtotal - newDisc);
                      setPaidAmount(String(newTotal));
                    }}
                    className="input input-sm w-24 text-xs font-bold text-emerald-400 text-right"
                  />
                  <div className="flex items-center gap-0.5 bg-[var(--color-surface-light)] rounded p-0.5 border border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscount(discountValue, 'fixed');
                        const newDisc = Math.min(subtotal, discountValue);
                        const newTotal = Math.max(0, subtotal - newDisc);
                        setPaidAmount(String(newTotal));
                      }}
                      className={`px-2 py-0.5 text-xs font-bold rounded ${discountType === 'fixed' ? 'bg-blue-600 text-white' : 'text-[var(--color-text-dim)]'}`}
                    >
                      Rp
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscount(discountValue, 'percent');
                        const newDisc = Math.min(subtotal, Math.round((subtotal * discountValue) / 100));
                        const newTotal = Math.max(0, subtotal - newDisc);
                        setPaidAmount(String(newTotal));
                      }}
                      className={`px-2 py-0.5 text-xs font-bold rounded ${discountType === 'percent' ? 'bg-blue-600 text-white' : 'text-[var(--color-text-dim)]'}`}
                    >
                      %
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mb-4">
              <p className="text-xs text-[var(--color-text-muted)]">Total Tagihan</p>
              <p className="text-3xl font-bold gradient-text">{formatCurrency(grandTotal)}</p>
            </div>

            {paymentMethod === 'cash' ? (
              <>
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-muted)] mb-2 block">Jumlah Bayar (Tunai)</label>
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

                {Number(paidAmount) >= grandTotal && (
                  <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">Kembalian</p>
                    <p className="text-2xl font-bold text-green-400">
                      {formatCurrency(Number(paidAmount) - grandTotal)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-2">
                <span className="badge badge-info text-xs px-3 py-1 font-bold">
                  {paymentMethod === 'qris' ? 'Pembayaran Non-Tunai (QRIS)' : 'Pembayaran Non-Tunai (Bank Transfer)'}
                </span>
                <p className="text-xs text-[var(--color-text-dim)]">
                  Konfirmasi pembayaran setara <strong>{formatCurrency(grandTotal)}</strong> tanpa memerlukan kembalian.
                </p>
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={paying || (paymentMethod === 'cash' && Number(paidAmount) < grandTotal)}
              className="btn btn-success w-full btn-lg mt-6 font-bold"
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

      {/* Open Shift Modal (Kas Awal) */}
      {showOpenShiftModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto mb-2">
                <ShoppingCart size={24} />
              </div>
              <h3 className="font-bold text-lg">Buka Shift Kasir</h3>
              <p className="text-xs text-[var(--color-text-dim)]">Masukkan kas awal yang ada di laci kasir saat ini</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-1 block">Kas Awal di Laci Kasir (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={openShiftAmount}
                  onChange={(e) => setOpenShiftAmount(e.target.value)}
                  className="input text-center text-xl font-bold w-full"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenShiftAmount('0');
                    handleOpenShift();
                  }}
                  className="btn btn-secondary flex-1 py-3 text-sm font-semibold"
                >
                  Rp 0 (Tanpa Kas Awal)
                </button>
                <button
                  type="button"
                  onClick={handleOpenShift}
                  disabled={openingShift}
                  className="btn btn-primary flex-1 py-3 text-sm font-bold gap-2"
                >
                  {openingShift ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Buka Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan Shift / Closing Kasir Modal */}
      {showClosingModal && closingData && (
        <div className="modal-overlay" onClick={() => setShowClosingModal(false)}>
          <div className="modal-content max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <h3 className="font-bold text-base text-[var(--color-text)]">Ringkasan Shift</h3>
              <button onClick={() => setShowClosingModal(false)} className="btn btn-ghost btn-icon">
                <X size={18} />
              </button>
            </div>

            {/* Info Shift */}
            <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Kasir</span>
                <span className="font-semibold text-[var(--color-text)]">{user?.name || 'Kasir'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Buka</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {closingData.startedAt ? new Date(closingData.startedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Tutup</span>
                <span className="font-semibold text-[var(--color-text)]">
                  {new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
            </div>

            {/* Kas di Laci Kasir */}
            <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-2 text-xs">
              <p className="font-bold text-xs text-[var(--color-text)] border-b border-[var(--color-border)] pb-1">Kas di Laci Kasir</p>
              
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Kas Awal di Laci Kasir</span>
                <span className="font-semibold">{formatCurrency(closingData.openAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Tunai (Masuk)</span>
                <span className="font-semibold">{formatCurrency(closingData.totalCashSales || closingData.totalCash || 0)}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>Pengeluaran (Tunai)</span>
                <span className="font-semibold">-{formatCurrency(closingData.totalExpenses || 0)}</span>
              </div>
              
              <div className="flex justify-between pt-1 border-t border-[var(--color-border)] font-bold text-sm">
                <span>Kas yang Diharapkan</span>
                <span className="text-emerald-400">{formatCurrency(closingData.expectedAmount || 0)}</span>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <label className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 block">Kas di Laci Kasir (Hitungan Fisik)</label>
                <input
                  type="number"
                  value={drawerAmount}
                  onChange={(e) => setDrawerAmount(e.target.value)}
                  className="input text-center text-lg font-bold w-full py-1.5"
                  placeholder="0"
                />
              </div>

              {/* Status Selisih */}
              {(() => {
                const actual = Number(drawerAmount) || 0;
                const expected = closingData.expectedAmount || 0;
                const diff = actual - expected;
                const label = diff > 0 ? `Lebih +${formatCurrency(diff)}` : diff < 0 ? `Kurang -${formatCurrency(Math.abs(diff))}` : 'Pas (Sesuai Rp 0)';
                const bgClass = diff >= 0 ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border-red-500/30 text-red-400';
                return (
                  <div className={`p-2 rounded-lg border text-center font-bold text-xs mt-1 ${bgClass}`}>
                    {label}
                  </div>
                );
              })()}
            </div>

            {/* Ikhtisar */}
            <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1.5 text-xs">
              <p className="font-bold text-xs text-[var(--color-text)] border-b border-[var(--color-border)] pb-1">Ikhtisar</p>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Transaksi</span>
                <span className="font-bold text-blue-400">{closingData.totalTxCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Total Penjualan</span>
                <span className="font-bold text-emerald-400">{formatCurrency(closingData.totalSales || closingData.totalOmset || 0)}</span>
              </div>
            </div>

            {/* Rincian Pembayaran */}
            <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1.5 text-xs">
              <p className="font-bold text-xs text-[var(--color-text)] border-b border-[var(--color-border)] pb-1">Rincian Pembayaran</p>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Tunai</span>
                <span className="font-semibold">{formatCurrency(closingData.totalCashSales || closingData.totalCash || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">QRIS</span>
                <span className="font-semibold text-blue-400">{formatCurrency(closingData.totalQris || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Transfer</span>
                <span className="font-semibold text-blue-400">{formatCurrency(closingData.totalTransfer || 0)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[var(--color-border)] font-bold">
                <span className="text-[var(--color-text-muted)]">Total Non-Tunai</span>
                <span className="text-blue-400">{formatCurrency(closingData.totalNonCash || 0)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handlePrintClosing}
                className="btn btn-secondary flex-1 gap-2 font-bold py-2.5"
              >
                <Printer size={16} />
                Cetak Struk
              </button>

              <button
                type="button"
                onClick={handleConfirmCloseShift}
                disabled={closingShift}
                className="btn btn-primary flex-1 gap-2 font-bold py-2.5"
              >
                {closingShift ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Tutup Shift & Selesai
              </button>
            </div>
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
                            note: i.note,
                          })),
                          subtotal: Number(lastTransaction.subtotal || subtotal),
                          discount: Number(lastTransaction.discount || discountAmount),
                          total: Number(lastTransaction.total || grandTotal),
                          paidAmount: Number(lastTransaction.paidAmount || grandTotal),
                          changeAmount: Number(lastTransaction.changeAmount || 0),
                          paymentMethod: lastTransaction.paymentMethod || paymentMethod,
                          orderType: lastTransaction.orderType || orderType,
                          tableNo: lastTransaction.tableNo || tableNo,
                          note: lastTransaction.note || globalNote,
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
              {/* Product-Specific Variants (Varian Rasa / Submenu) */}
              {Array.isArray(optionModalProduct.variants) && optionModalProduct.variants.length > 0 && (
                <div className="glass-card p-3 space-y-2 border border-blue-500/30">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Varian / Rasa Produk</span>
                    <span className="badge badge-info text-[10px]">Pilih 1</span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {/* Normal option */}
                    <button
                      type="button"
                      onClick={() => setSelectedVariant(null)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                        selectedVariant === null
                          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)]/15 text-white font-bold'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${selectedVariant === null ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white' : 'border-gray-500'}`}>
                          {selectedVariant === null && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="text-xs font-medium">Biasa / Regular</span>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">{formatCurrency(Number(optionModalProduct.price))}</span>
                    </button>

                    {/* Variant options */}
                    {optionModalProduct.variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      const vAddPrice = Number(v.additionalPrice) || 0;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariant({ id: v.id, name: v.name, additionalPrice: vAddPrice })}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)]/15 text-white font-bold'
                              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${isSelected ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-500)] text-white' : 'border-gray-500'}`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-xs font-medium">{v.name}</span>
                          </div>
                          <span className="text-xs font-mono text-emerald-400">
                            {formatCurrency(Number(optionModalProduct.price) + vAddPrice)}
                            {vAddPrice > 0 && <span className="text-[10px] text-[var(--color-text-dim)] ml-1">(+{formatCurrency(vAddPrice)})</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category Option Groups */}
              {allOptionGroups
                .filter(g => g.categoryId === optionModalProduct.categoryId || (Array.isArray(g.categoryIds) && (g.categoryIds.includes(optionModalProduct.categoryId || '') || g.categoryIds.includes('all'))))
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
                          const optPrice = Number(opt.price) || 0;
                          return (
                            <button
                              key={opt.id || opt.name}
                              type="button"
                              onClick={() => toggleOption({ name: opt.name, price: optPrice })}
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
                              {optPrice > 0 ? (
                                <span className="text-xs font-mono text-emerald-400">+Rp {optPrice.toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-xs font-mono text-[var(--color-text-dim)]">Gratis</span>
                              )}
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
                const groupsForProduct = allOptionGroups.filter(g => g.categoryId === optionModalProduct.categoryId || (Array.isArray(g.categoryIds) && (g.categoryIds.includes(optionModalProduct.categoryId || '') || g.categoryIds.includes('all'))));
                const allSelected = Object.values(selectedOptions).flat();
                
                const basePrice = Number(optionModalProduct.price) || 0;
                const variantPrice = selectedVariant ? Number(selectedVariant.additionalPrice) : 0;
                const optionsAddPrice = allSelected.reduce((sum, item) => sum + item.price, 0);
                
                const mainItemPrice = basePrice > 0 ? (basePrice + variantPrice) : (variantPrice > 0 ? variantPrice : basePrice);
                const totalPrice = mainItemPrice + optionsAddPrice;

                return (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--color-text-muted)]">Total Harga Item</span>
                      <span className="font-bold text-lg text-emerald-400">{formatCurrency(totalPrice)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        // Validation for Category Option Groups
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

                        // Separate zero-price options vs extra-price options
                        const zeroPriceOptions = allSelected.filter(s => s.price === 0);
                        const extraPriceOptions = allSelected.filter(s => s.price > 0);

                        // Main variant name string (without (+Rp 0))
                        const mainVariantParts = [
                          selectedVariant?.name,
                          ...zeroPriceOptions.map(s => s.name)
                        ].filter(Boolean);

                        const mainVariantName = mainVariantParts.join(', ');

                        // 1. Add Main Item
                        addItem(
                          {
                            id: optionModalProduct.id,
                            name: optionModalProduct.name,
                            price: mainItemPrice
                          },
                          mainVariantName ? {
                            id: selectedVariant?.id || ('var_' + Math.random().toString(36).substring(2, 9)),
                            name: mainVariantName,
                            additionalPrice: 0
                          } : undefined
                        );

                        // 2. Add Extra Options as separate sub-items
                        for (const opt of extraPriceOptions) {
                          const grp = groupsForProduct.find(g => (selectedOptions[g.id] || []).some(s => s.name === opt.name));
                          const subTitle = grp ? `+ ${grp.name} ${opt.name}` : `+ ${opt.name}`;
                          addItem({
                            id: 'sub_' + Math.random().toString(36).substring(2, 9),
                            name: subTitle,
                            price: opt.price
                          });
                        }

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
