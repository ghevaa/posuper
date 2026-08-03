import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Clock, RefreshCw, Printer, Eye, X, Loader2, Search, Filter, 
  Calendar, CreditCard, ChevronDown, ChevronUp, TrendingUp 
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatTime, formatDateTime } from '../lib/utils';
import { printTransactionReceipt } from '../lib/reprint-helper';
import { useAuthStore } from '../stores/auth.store';
import toast from 'react-hot-toast';

// Interfaces
interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  subtotal: number;
  note?: string;
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
  items?: TransactionItem[]; // Detailed items if available in get details
}

export default function POSHistoryPage() {
  const { user } = useAuthStore();
  
  // Filter States
  const [dateFilter, setDateFilter] = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchInvoice, setSearchInvoice] = useState('');
  
  // UI States
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState<string | null>(null);

  // Click outside listener for dropdowns
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Data
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['transactions-today', dateFilter, statusFilter, orderTypeFilter, paymentMethodFilter, searchInvoice],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('dateFilter', dateFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (orderTypeFilter !== 'all') params.append('orderType', orderTypeFilter);
      if (paymentMethodFilter !== 'all') params.append('paymentMethod', paymentMethodFilter);
      if (searchInvoice) params.append('invoiceNo', searchInvoice);

      const res = await api.get<{ data: Transaction[], grandTotal: number, count: number }>(`/transactions/today?${params.toString()}`);
      return res;
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchInvoice(searchInput);
  };

  const handleReprint = async (transaction: Transaction) => {
    try {
      setIsPrinting(transaction.id);
      
      let printData: any = transaction;
      if (!transaction.items || transaction.items.length === 0) {
        const detailRes = await api.get<{ data: any }>(`/transactions/${transaction.id}`);
        printData = detailRes.data;
      }
      
      await printTransactionReceipt(printData, user?.name || 'Kasir');
    } catch (error) {
      console.error(error);
    } finally {
      setIsPrinting(null);
    }
  };

  const viewDetails = async (transaction: Transaction) => {
    try {
      if (!transaction.items || transaction.items.length === 0) {
        const detailRes = await api.get<{ data: any }>(`/transactions/${transaction.id}`);
        setSelectedTransaction(detailRes.data);
      } else {
        setSelectedTransaction(transaction);
      }
      setIsDetailModalOpen(true);
    } catch (error) {
      toast.error('Gagal memuat detail transaksi');
    }
  };

  // Grouping Transactions by Date
  const groupedTransactions = useMemo(() => {
    if (!data?.data) return {};
    
    const groups: Record<string, { dateStr: string, transactions: Transaction[], subtotal: number }> = {};
    
    data.data.forEach(tx => {
      const dateObj = new Date(tx.createdAt);
      // Format as YYYY-MM-DD for grouping key
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      // Format for display (e.g., 24 Oktober 2023)
      const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
      const dateStr = dateObj.toLocaleDateString('id-ID', options);
      
      if (!groups[dateKey]) {
        groups[dateKey] = { dateStr, transactions: [], subtotal: 0 };
      }
      
      groups[dateKey].transactions.push(tx);
      groups[dateKey].subtotal += tx.total;
    });
    
    // Sort keys descending
    return Object.keys(groups).sort().reverse().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {} as Record<string, typeof groups[string]>);
  }, [data?.data]);

  // Options for filters
  const dateOptions = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: 'this_week', label: 'Minggu Ini' },
    { value: 'last_week', label: 'Minggu Lalu' },
    { value: 'this_month', label: 'Bulan Ini' },
    { value: 'last_month', label: 'Bulan Lalu' },
    { value: 'all', label: 'Kapan Saja' }
  ];

  const statusOptions = [
    { value: 'all', label: 'Semua Status' },
    { value: 'completed', label: 'Lunas' },
    { value: 'pending', label: 'Pending' },
    { value: 'voided', label: 'Void' }
  ];

  const orderTypeOptions = [
    { value: 'all', label: 'Semua Tipe' },
    { value: 'dine_in', label: 'Dine In' },
    { value: 'take_away', label: 'Take Away' }
  ];

  const paymentMethodOptions = [
    { value: 'all', label: 'Semua Metode' },
    { value: 'cash', label: 'Tunai' },
    { value: 'qris', label: 'QRIS' },
    { value: 'transfer', label: 'Transfer' }
  ];

  const renderBadgeStatus = (status: string) => {
    switch(status.toLowerCase()) {
      case 'completed': return <span className="badge badge-success">Lunas</span>;
      case 'pending': return <span className="badge badge-warning">Pending</span>;
      case 'voided': return <span className="badge badge-danger">Void</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const renderOrderType = (type: string, tableNo?: string) => {
    if (type.toLowerCase() === 'take_away') {
      return <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>Take Away</span>;
    }
    return (
      <span className="badge" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
        Dine In {tableNo ? `- Meja ${tableNo}` : ''}
      </span>
    );
  };

  const renderPaymentMethod = (method: string) => {
    switch(method.toLowerCase()) {
      case 'cash': return <span className="badge badge-info">Tunai</span>;
      case 'qris': return <span className="badge" style={{ backgroundColor: '#e0e7ff', color: '#3730a3' }}>QRIS</span>;
      case 'transfer': return <span className="badge" style={{ backgroundColor: '#fce7f3', color: '#9d174d' }}>Transfer</span>;
      default: return <span className="badge">{method || '-'}</span>;
    }
  };

  const toggleDropdown = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header & Filters */}
      <div className="bg-white border-b p-4 shadow-sm z-10 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Riwayat Transaksi</h1>
            <p className="text-slate-500 text-sm">Lihat dan kelola riwayat transaksi kasir.</p>
          </div>
          <button 
            onClick={() => refetch()} 
            className="btn btn-secondary btn-sm"
            disabled={isFetching}
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
            Muat Ulang
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3" ref={dropdownRef}>
          {/* Date Filter Pill */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('date')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-slate-100 hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              <Calendar size={14} className="text-slate-600" />
              {dateOptions.find(o => o.value === dateFilter)?.label}
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {activeDropdown === 'date' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border p-1 z-20">
                {dateOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 ${dateFilter === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}
                    onClick={() => { setDateFilter(opt.value); setActiveDropdown(null); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status Filter Pill */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('status')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-slate-100 hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              <Filter size={14} className="text-slate-600" />
              {statusOptions.find(o => o.value === statusFilter)?.label}
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {activeDropdown === 'status' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border p-1 z-20">
                {statusOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 ${statusFilter === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}
                    onClick={() => { setStatusFilter(opt.value); setActiveDropdown(null); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Order Type Filter Pill */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('orderType')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-slate-100 hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              <span className="text-slate-600 text-xs">🍽️</span>
              {orderTypeOptions.find(o => o.value === orderTypeFilter)?.label}
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {activeDropdown === 'orderType' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border p-1 z-20">
                {orderTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 ${orderTypeFilter === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}
                    onClick={() => { setOrderTypeFilter(opt.value); setActiveDropdown(null); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method Filter Pill */}
          <div className="relative">
            <button 
              onClick={() => toggleDropdown('paymentMethod')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-slate-100 hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              <CreditCard size={14} className="text-slate-600" />
              {paymentMethodOptions.find(o => o.value === paymentMethodFilter)?.label}
              <ChevronDown size={14} className="text-slate-500" />
            </button>
            {activeDropdown === 'paymentMethod' && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border p-1 z-20">
                {paymentMethodOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-slate-50 ${paymentMethodFilter === opt.value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700'}`}
                    onClick={() => { setPaymentMethodFilter(opt.value); setActiveDropdown(null); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-[200px]">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Cari No. Invoice..."
                className="w-full pl-9 pr-4 py-1.5 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              {searchInput && (
                <button 
                  type="button" 
                  onClick={() => { setSearchInput(''); setSearchInvoice(''); }} 
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="px-6 py-4">
        <div className="card p-4 flex items-center justify-between bg-white bg-opacity-80 backdrop-blur-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Transaksi</p>
              <p className="text-2xl font-bold text-slate-800">{data?.count || 0}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 font-medium">Grand Total</p>
            <p className="text-2xl font-bold text-primary-700">{formatCurrency(data?.grandTotal || 0)}</p>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Memuat data transaksi...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <p>Terjadi kesalahan saat memuat data.</p>
            <button onClick={() => refetch()} className="btn btn-secondary mt-4">Coba Lagi</button>
          </div>
        ) : !data?.data || data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-lg shadow-sm border border-slate-200">
            <Search size={48} className="text-slate-300 mb-4" />
            <p className="text-lg font-medium">Tidak ada transaksi ditemukan</p>
            <p className="text-sm text-slate-400">Ubah filter atau pencarian Anda</p>
          </div>
        ) : (
          <div className="table-container rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold text-xs sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3">Tanggal & Waktu</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Kasir</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.keys(groupedTransactions).map(dateKey => (
                  <React.Fragment key={dateKey}>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <td colSpan={8} className="px-4 py-2 font-medium text-slate-800">
                        <div className="flex justify-between items-center">
                          <span>{groupedTransactions[dateKey].dateStr}</span>
                          <span className="text-primary-700 font-semibold">{formatCurrency(groupedTransactions[dateKey].subtotal)}</span>
                        </div>
                      </td>
                    </tr>
                    {groupedTransactions[dateKey].transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium">{tx.invoiceNo}</td>
                        <td className="px-4 py-3">{tx.userName}</td>
                        <td className="px-4 py-3">{renderPaymentMethod(tx.paymentMethod)}</td>
                        <td className="px-4 py-3">{renderOrderType(tx.orderType, tx.tableNo)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(tx.total)}</td>
                        <td className="px-4 py-3">{renderBadgeStatus(tx.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => viewDetails(tx)}
                              className="btn btn-icon btn-sm text-slate-600 hover:text-primary-600 hover:bg-primary-50"
                              title="Lihat Detail"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleReprint(tx)}
                              disabled={isPrinting === tx.id || tx.status.toLowerCase() === 'voided'}
                              className="btn btn-icon btn-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              title="Cetak Struk"
                            >
                              {isPrinting === tx.id ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {isDetailModalOpen && selectedTransaction && (
        <div className="modal-overlay z-50">
          <div className="modal-content max-w-2xl w-full p-0 overflow-hidden bg-white rounded-xl shadow-2xl">
            {/* Modal Header */}
            <div className="bg-primary-600 text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Detail Transaksi</h3>
                <p className="text-primary-100 text-sm">{selectedTransaction.invoiceNo}</p>
              </div>
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 hover:bg-primary-700 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {/* Transaction Info Grid */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div>
                  <p className="text-sm text-slate-500">Tanggal & Waktu</p>
                  <p className="font-medium text-slate-800">{formatDateTime(selectedTransaction.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Kasir</p>
                  <p className="font-medium text-slate-800">{selectedTransaction.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <div className="mt-1">{renderBadgeStatus(selectedTransaction.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Tipe Pesanan</p>
                  <div className="mt-1">{renderOrderType(selectedTransaction.orderType, selectedTransaction.tableNo)}</div>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Metode Pembayaran</p>
                  <div className="mt-1">{renderPaymentMethod(selectedTransaction.paymentMethod)}</div>
                </div>
                {selectedTransaction.note && (
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500">Catatan</p>
                    <p className="font-medium text-slate-800 italic">{selectedTransaction.note}</p>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2">Item Pesanan</h4>
              <div className="overflow-hidden border border-slate-200 rounded-lg mb-6">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Produk</th>
                      <th className="px-4 py-2 font-medium text-center">Qty</th>
                      <th className="px-4 py-2 font-medium text-right">Harga</th>
                      <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransaction.items?.length ? (
                      selectedTransaction.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <p className="font-medium">{item.productName}</p>
                            {item.note && <p className="text-xs text-slate-500 italic">{item.note}</p>}
                          </td>
                          <td className="px-4 py-2 text-center">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-slate-500">
                          Memuat detail produk...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Summary Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium">{formatCurrency(selectedTransaction.subtotal)}</span>
                  </div>
                  {selectedTransaction.discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Diskon</span>
                      <span>-{formatCurrency(selectedTransaction.discount)}</span>
                    </div>
                  )}
                  {selectedTransaction.tax > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pajak/Biaya</span>
                      <span className="font-medium">{formatCurrency(selectedTransaction.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-bold text-slate-800">
                    <span>Total</span>
                    <span className="text-primary-700">{formatCurrency(selectedTransaction.total)}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-slate-600">Dibayar</span>
                    <span className="font-medium">{formatCurrency(selectedTransaction.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Kembalian</span>
                    <span className="font-medium">{formatCurrency(selectedTransaction.changeAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="btn btn-ghost"
              >
                Tutup
              </button>
              <button 
                onClick={() => handleReprint(selectedTransaction)}
                disabled={isPrinting === selectedTransaction.id || selectedTransaction.status.toLowerCase() === 'voided'}
                className="btn btn-primary flex items-center gap-2"
              >
                {isPrinting === selectedTransaction.id ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
