import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatCurrency, formatDateTime } from '../lib/utils';
import {
  Eye, X, Download, Loader2, Printer, Search, Filter, Calendar, CreditCard,
  ChevronDown, ChevronUp, TrendingUp, Users, RefreshCw
} from 'lucide-react';
import { printTransactionReceipt } from '../lib/reprint-helper';
import { useAuthStore } from '../stores/auth.store';
import { toast } from 'react-hot-toast';

// Interfaces
interface TransactionItem {
  id: string;
  productId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface Transaction {
  id: string;
  invoiceNo: string;
  userId: string;
  userName: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  status: string;
  paymentMethod: string;
  orderType: string;
  tableNo?: string;
  note?: string;
  createdAt: string;
  items?: TransactionItem[];
}

interface TxResponse {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  summaryByDate: { date: string; totalAmount: number; count: number }[];
  summaryByUser: { userId: string; userName: string; totalAmount: number; count: number }[];
  grandTotal: number;
}

// Filter mappings
const DATE_FILTERS = [
  { value: 'all', label: 'Kapan Saja' },
  { value: 'today', label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: 'this_week', label: 'Minggu Ini' },
  { value: 'last_week', label: 'Minggu Lalu' },
  { value: 'this_month', label: 'Bulan Ini' },
  { value: 'last_month', label: 'Bulan Lalu' },
  { value: 'custom', label: 'Custom (Pilih Tanggal)' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'completed', label: 'Lunas' },
  { value: 'pending', label: 'Pending' },
  { value: 'voided', label: 'Void' }
];

const ORDER_TYPE_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'take_away', label: 'Take Away' }
];

const PAYMENT_METHOD_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'transfer', label: 'Transfer' }
];

function Dropdown({ label, icon: Icon, options, value, onChange }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o: any) => o.value === value) || options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-sm hover:border-[var(--color-primary)] transition-colors"
      >
        {Icon && <Icon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
        <span>{label}: <span className="font-medium">{selectedOption.label}</span></span>
        <ChevronDown className="w-3 h-3 ml-1" />
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg overflow-hidden py-1">
          {options.map((opt: any) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-background)] ${value === opt.value ? 'text-[var(--color-primary)] font-medium bg-[var(--color-primary-transparent)]' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTransactions() {
  // State
  const [dateFilter, setDateFilter] = useState('all');
  const [fromDate, setFromDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('all');
  const [orderType, setOrderType] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [userIdFilter, setUserIdFilter] = useState('all');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;
  
  // Collapse state for summary cards
  const [showDateSummary, setShowDateSummary] = useState(false);
  const [showUserSummary, setShowUserSummary] = useState(false);

  // Detail Modal
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Queries
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<{ data: any[] }>('/users');
      return res.data;
    }
  });

  const { data: txData, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', { dateFilter, fromDate, toDate, status, orderType, paymentMethod, invoiceNo, userId: userIdFilter, page, limit }],
    queryFn: async () => {
      const params: any = { page, limit };
      if (dateFilter !== 'all') {
        params.dateFilter = dateFilter;
        if (dateFilter === 'custom') {
          if (fromDate) params.from = fromDate;
          if (toDate) params.to = toDate;
        }
      }
      if (status !== 'all') params.status = status;
      if (orderType !== 'all') params.orderType = orderType;
      if (paymentMethod !== 'all') params.paymentMethod = paymentMethod;
      if (userIdFilter !== 'all') params.userId = userIdFilter;
      if (invoiceNo) params.invoiceNo = invoiceNo;
      
      const res = await api.get<TxResponse>('/transactions', params);
      return res;
    }
  });
  
  const { data: txDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['transaction-detail', selectedTxId],
    queryFn: async () => {
      if (!selectedTxId) return null;
      const res = await api.get<{ data: Transaction }>(`/transactions/${selectedTxId}`);
      return res.data;
    },
    enabled: !!selectedTxId
  });

  // Handle Search
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInvoiceNo(searchInput);
    setPage(1);
  };

  // Export
  const handleExport = async () => {
    try {
      const queryParams: string[] = [];
      if (dateFilter === 'custom') {
        if (fromDate) queryParams.push(`from=${fromDate}`);
        if (toDate) queryParams.push(`to=${toDate}`);
      } else if (dateFilter !== 'all') {
        queryParams.push(`dateFilter=${dateFilter}`);
      }
      const url = queryParams.length > 0 ? `/export/transactions?${queryParams.join('&')}` : '/export/transactions';
      await api.downloadFile(url, 'transaksi-export.xlsx');
      toast.success('Berhasil mengunduh laporan transaksi');
    } catch (error) {
      toast.error('Gagal mengunduh laporan');
    }
  };

  // Reprint
  const handleReprint = (tx: Transaction) => {
    try {
      printTransactionReceipt(tx);
      toast.success('Mencetak ulang struk...');
    } catch (err) {
      toast.error('Gagal mencetak struk');
    }
  };

  // Prepare users filter options
  const userOptions = [
    { value: 'all', label: 'Semua Kasir' },
    ...(usersData?.map((u: any) => ({ value: u.id, label: u.name })) || [])
  ];

  // Helper renderers
  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'completed': return <span className="badge badge-success">Lunas</span>;
      case 'pending': return <span className="badge badge-warning">Pending</span>;
      case 'voided': return <span className="badge badge-danger">Void</span>;
      default: return <span className="badge badge-info">{s}</span>;
    }
  };
  
  const getPaymentMethodBadge = (pm: string) => {
    switch (pm) {
      case 'cash': return <span className="badge">TUNAI</span>;
      case 'qris': return <span className="badge bg-blue-500 text-white border-none">QRIS</span>;
      case 'transfer': return <span className="badge bg-purple-500 text-white border-none">TRANSFER</span>;
      default: return <span className="badge">{pm}</span>;
    }
  };

  const getOrderTypeBadge = (ot: string) => {
    switch (ot) {
      case 'dine_in': return <span className="badge badge-info">Dine In</span>;
      case 'take_away': return <span className="badge badge-warning">Take Away</span>;
      default: return <span className="badge">{ot}</span>;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Transaksi</h1>
          <p className="text-[var(--color-text-secondary)]">Pantau dan kelola semua transaksi sistem</p>
        </div>
        <button onClick={handleExport} className="btn btn-secondary flex items-center gap-2">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <Dropdown label="Tanggal" icon={Calendar} options={DATE_FILTERS} value={dateFilter} onChange={(v: string) => { setDateFilter(v); setPage(1); }} />
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-full text-sm">
              <span className="text-[var(--color-text-secondary)] text-xs font-medium">Dari:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="bg-transparent border-none text-xs focus:outline-none text-[var(--color-text)] font-mono"
              />
              <span className="text-[var(--color-text-secondary)] text-xs font-medium">s/d</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="bg-transparent border-none text-xs focus:outline-none text-[var(--color-text)] font-mono"
              />
            </div>
          )}
          <Dropdown label="Status" icon={Filter} options={STATUS_FILTERS} value={status} onChange={(v: string) => { setStatus(v); setPage(1); }} />
          <Dropdown label="Tipe" icon={RefreshCw} options={ORDER_TYPE_FILTERS} value={orderType} onChange={(v: string) => { setOrderType(v); setPage(1); }} />
          <Dropdown label="Pembayaran" icon={CreditCard} options={PAYMENT_METHOD_FILTERS} value={paymentMethod} onChange={(v: string) => { setPaymentMethod(v); setPage(1); }} />
          <Dropdown label="Kasir" icon={Users} options={userOptions} value={userIdFilter} onChange={(v: string) => { setUserIdFilter(v); setPage(1); }} />
        </div>
        
        <form onSubmit={handleSearchSubmit} className="relative max-w-md">
          <input
            type="text"
            placeholder="Cari Nomor Invoice..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-md pl-10 pr-4 py-2 focus:outline-none focus:border-[var(--color-primary)]"
          />
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <button type="submit" className="hidden" />
        </form>
      </div>

      {/* Summary Cards */}
      {txData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total */}
          <div className="card p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
              <h3 className="font-semibold text-lg">Total Transaksi</h3>
            </div>
            <p className="text-3xl font-bold gradient-text">{formatCurrency(txData.grandTotal || 0)}</p>
            <p className="text-[var(--color-text-secondary)] mt-1">{txData.total || 0} transaksi ditemukan</p>
          </div>

          {/* Card 2: Per Tanggal */}
          <div className="card p-5">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowDateSummary(!showDateSummary)}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="font-semibold text-lg">Per Tanggal</h3>
              </div>
              {showDateSummary ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
            {showDateSummary && txData.summaryByDate && (
              <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2">
                {txData.summaryByDate.length > 0 ? txData.summaryByDate.map((item: any) => (
                  <div key={item.date} className="flex justify-between items-center text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{item.date}</div>
                      <div className="text-xs text-[var(--color-text-secondary)]">{item.count} trx</div>
                    </div>
                    <div className="font-semibold">{formatCurrency(item.totalAmount)}</div>
                  </div>
                )) : <div className="text-sm text-center py-2 text-[var(--color-text-secondary)]">Tidak ada data</div>}
              </div>
            )}
          </div>

          {/* Card 3: Per Kasir */}
          <div className="card p-5">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowUserSummary(!showUserSummary)}
            >
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--color-primary)]" />
                <h3 className="font-semibold text-lg">Per Kasir</h3>
              </div>
              {showUserSummary ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
            {showUserSummary && txData.summaryByUser && (
              <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2">
                {txData.summaryByUser.length > 0 ? txData.summaryByUser.map((item: any) => (
                  <div key={item.userId} className="flex justify-between items-center text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{item.userName}</div>
                      <div className="text-xs text-[var(--color-text-secondary)]">{item.count} trx</div>
                    </div>
                    <div className="font-semibold">{formatCurrency(item.totalAmount)}</div>
                  </div>
                )) : <div className="text-sm text-center py-2 text-[var(--color-text-secondary)]">Tidak ada data</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden relative">
        {isFetching && (
          <div className="absolute inset-0 bg-[var(--color-surface)]/50 z-10 flex items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          </div>
        )}
        <div className="table-container">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                <th className="p-4 font-semibold text-sm">Invoice</th>
                <th className="p-4 font-semibold text-sm">Tanggal</th>
                <th className="p-4 font-semibold text-sm">Kasir</th>
                <th className="p-4 font-semibold text-sm">Metode</th>
                <th className="p-4 font-semibold text-sm">Tipe</th>
                <th className="p-4 font-semibold text-sm text-right">Total</th>
                <th className="p-4 font-semibold text-sm text-center">Status</th>
                <th className="p-4 font-semibold text-sm text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : txData?.data?.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-[var(--color-text-secondary)]">Tidak ada data transaksi.</td></tr>
              ) : (
                txData?.data?.map((tx: Transaction) => (
                  <tr key={tx.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-background)] transition-colors">
                    <td className="p-4 font-mono text-sm">{tx.invoiceNo}</td>
                    <td className="p-4 text-sm whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                    <td className="p-4 text-sm">{tx.userName}</td>
                    <td className="p-4">{getPaymentMethodBadge(tx.paymentMethod)}</td>
                    <td className="p-4">{getOrderTypeBadge(tx.orderType)}</td>
                    <td className="p-4 text-right font-bold text-sm whitespace-nowrap">{formatCurrency(tx.total)}</td>
                    <td className="p-4 text-center">{getStatusBadge(tx.status)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedTxId(tx.id)}
                          className="btn-icon btn-sm text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-blue-500/10"
                          title="Detail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleReprint(tx)}
                          className="btn-icon btn-sm text-[var(--color-text-secondary)] hover:text-green-500 hover:bg-green-500/10"
                          title="Cetak Struk"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {txData && txData.total > 0 && (
          <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface)]">
            <div className="text-sm text-[var(--color-text-secondary)]">
              Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, txData.total)} dari {txData.total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary btn-sm"
              >
                Sebelumnya
              </button>
              <span className="text-sm font-medium px-4">Halaman {page} dari {Math.ceil(txData.total / limit)}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(txData.total / limit)}
                className="btn btn-secondary btn-sm"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTxId && (
        <div className="modal-overlay" onClick={() => setSelectedTxId(null)}>
          <div className="modal-content max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
              <h2 className="text-lg font-bold">Detail Transaksi</h2>
              <button onClick={() => setSelectedTxId(null)} className="btn-icon">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {isLoadingDetail ? (
                <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" /></div>
              ) : txDetail ? (
                <div className="space-y-6">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-4 text-sm bg-[var(--color-background)] p-4 rounded-lg">
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">No. Invoice</span>
                      <span className="font-mono font-medium">{txDetail.invoiceNo}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">Tanggal</span>
                      <span className="font-medium">{formatDateTime(txDetail.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">Kasir</span>
                      <span className="font-medium">{txDetail.userName}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">Tipe Pesanan</span>
                      <span>{getOrderTypeBadge(txDetail.orderType)}</span>
                      {txDetail.tableNo && <span className="ml-2">Meja: {txDetail.tableNo}</span>}
                    </div>
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">Status</span>
                      <span>{getStatusBadge(txDetail.status)}</span>
                    </div>
                    <div>
                      <span className="text-[var(--color-text-secondary)] block text-xs">Pembayaran</span>
                      <span>{getPaymentMethodBadge(txDetail.paymentMethod)}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <h3 className="font-bold mb-3 border-b border-[var(--color-border)] pb-2">Item Pesanan</h3>
                    {txDetail.items && txDetail.items.length > 0 ? (
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
                            <th className="pb-2">Produk</th>
                            <th className="pb-2 text-right">Harga</th>
                            <th className="pb-2 text-center">Qty</th>
                            <th className="pb-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txDetail.items.map(item => (
                            <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                              <td className="py-2">
                                <div>{item.productName}</div>
                                {item.variantName && <div className="text-xs text-[var(--color-text-secondary)]">{item.variantName}</div>}
                              </td>
                              <td className="py-2 text-right">{formatCurrency(item.price)}</td>
                              <td className="py-2 text-center">{item.quantity}</td>
                              <td className="py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-[var(--color-text-secondary)] italic">Item tidak tersedia</p>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="bg-[var(--color-background)] p-4 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--color-text-secondary)]">Subtotal</span>
                      <span className="font-medium">{formatCurrency(txDetail.subtotal)}</span>
                    </div>
                    {txDetail.discount > 0 && (
                      <div className="flex justify-between text-sm text-green-500">
                        <span>Diskon</span>
                        <span>-{formatCurrency(txDetail.discount)}</span>
                      </div>
                    )}
                    {txDetail.tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Pajak</span>
                        <span>{formatCurrency(txDetail.tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t border-[var(--color-border)]">
                      <span>Total</span>
                      <span>{formatCurrency(txDetail.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-[var(--color-text-secondary)]">Bayar</span>
                      <span>{formatCurrency(txDetail.paidAmount)}</span>
                    </div>
                    {txDetail.changeAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Kembalian</span>
                        <span>{formatCurrency(txDetail.changeAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-red-500">Gagal memuat detail transaksi</div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-3 bg-[var(--color-surface)] rounded-b-lg">
              <button className="btn btn-ghost" onClick={() => setSelectedTxId(null)}>Tutup</button>
              {txDetail && (
                <button 
                  className="btn btn-primary flex items-center gap-2"
                  onClick={() => { handleReprint(txDetail); setSelectedTxId(null); }}
                >
                  <Printer className="w-4 h-4" /> Cetak Ulang Struk
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
