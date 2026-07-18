// ============================================================
// POS Yoga — POS Page (Cashier)
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCartStore } from '../stores/cart.store';
import { useAuthStore } from '../stores/auth.store';
import { formatCurrency } from '../lib/utils';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard,
  Loader2, X, Printer, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris'>('cash');
  const searchRef = useRef<HTMLInputElement>(null);

  const { items, addItem, removeItem, incrementQty, decrementQty, clearCart, getSubtotal } = useCartStore();
  const { user } = useAuthStore();

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<{ data: ProductData[] }>('/products'),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ data: CategoryData[] }>('/categories'),
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

  const handlePay = async () => {
    const isQris = paymentMethod === 'qris';
    const paid = Number(paidAmount);
    if (!isQris && paid < subtotal) {
      toast.error('Jumlah bayar kurang!');
      return;
    }
    setPaying(true);
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
        paidAmount: isQris ? subtotal : paid,
        discount: 0,
        taxRate: 0,
        paymentMethod,
      });

      if (isQris && res.data.midtransSnapToken) {
        if ((window as any).snap) {
          (window as any).snap.pay(res.data.midtransSnapToken, {
            onSuccess: (result: any) => {
              console.log('Midtrans Snap Success:', result);
              setLastTransaction(res.data);
              clearCart();
              setShowPayment(false);
              setShowReceipt(true);
              setPaidAmount('');
              toast.success('Pembayaran QRIS Berhasil!');
              qc.invalidateQueries({ queryKey: ['products'] });
            },
            onPending: (result: any) => {
              console.log('Midtrans Snap Pending:', result);
              setLastTransaction(res.data);
              clearCart();
              setShowPayment(false);
              setPaidAmount('');
              toast.success('Menunggu Pembayaran QRIS');
              qc.invalidateQueries({ queryKey: ['products'] });
            },
            onError: (result: any) => {
              console.error('Midtrans Snap Error:', result);
              toast.error('Pembayaran QRIS Gagal!');
            },
            onClose: () => {
              console.log('Midtrans Snap Closed');
              toast.error('Pemberitahuan: QRIS ditutup. Hubungi admin jika sudah bayar.');
            }
          });
        } else {
          toast.error('Gagal memuat Snap JS Midtrans!');
        }
      } else {
        setLastTransaction(res.data);
        clearCart();
        setShowPayment(false);
        setShowReceipt(true);
        setPaidAmount('');
        toast.success('Transaksi berhasil!');
        qc.invalidateQueries({ queryKey: ['products'] });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleProductClick = (product: ProductData) => {
    if (product.variants && product.variants.length > 0) {
      setVariantSelectionProduct(product);
    } else {
      addItem({ id: product.id, name: product.name, price: Number(product.price) });
      toast.success(`${product.name} +1`, { duration: 1000, icon: '🛒' });
    }
  };

  const quickAmounts = [subtotal, Math.ceil(subtotal / 10000) * 10000, Math.ceil(subtotal / 50000) * 50000, 100000, 200000, 500000].filter((v, i, a) => v >= subtotal && a.indexOf(v) === i).slice(0, 6);

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)]">
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
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`btn btn-sm ${!selectedCategory ? 'btn-primary' : 'btn-secondary'}`}
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`btn btn-sm ${selectedCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto">
          {productsLoading ? (
            <div className="flex items-center justify-center h-40"><div className="spinner" /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="glass-card p-4 text-left hover:border-[var(--color-primary-500)] transition-colors group"
                >
                  <div className="w-full h-20 rounded-lg bg-[var(--color-surface)] mb-3 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                    ) : '📦'}
                  </div>
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-[var(--color-primary-400)] font-semibold text-sm mt-1">
                    {formatCurrency(Number(product.price))}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-dim)] mt-1">Stok: {product.stock}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Cart */}
      <div className="w-[380px] flex flex-col glass-card">
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
                  <p className="font-medium text-sm truncate">{item.productName}</p>
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
                <p className="font-semibold text-sm w-24 text-right">{formatCurrency(item.subtotal)}</p>
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
                onClick={() => setPaymentMethod('qris')}
                className={`btn flex-grow ${paymentMethod === 'qris' ? 'btn-primary' : 'btn-secondary'}`}
              >
                QRIS (Midtrans)
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-sm text-[var(--color-text-muted)]">Total Tagihan</p>
              <p className="text-3xl font-bold gradient-text">{formatCurrency(subtotal)}</p>
            </div>

            {paymentMethod === 'qris' ? (
              <div className="text-center p-6 border border-dashed border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
                <p className="text-sm font-semibold text-orange-400 mb-2">Metode QRIS Terpilih</p>
                <p className="text-xs text-[var(--color-text-dim)]">Setelah klik konfirmasi, pop-up pembayaran QRIS Midtrans akan muncul untuk dipindai oleh pelanggan.</p>
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
              disabled={paying || (paymentMethod === 'cash' && Number(paidAmount) < subtotal)}
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

            <div className="flex gap-2">
              <button onClick={() => setShowReceipt(false)} className="btn btn-secondary flex-1">
                Tutup
              </button>
              <button className="btn btn-primary flex-1">
                <Printer size={16} /> Cetak Struk
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
    </div>
  );
}
