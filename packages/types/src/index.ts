// ============================================================
// POS Yoga — Shared Types
// ============================================================

// --- Roles ---
export type Role = 'developer' | 'admin' | 'cashier';

// --- User ---
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

// --- Category ---
export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: Date;
}

// --- Product ---
export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  image: string | null;
  categoryId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// --- Transaction ---
export type TransactionStatus = 'completed' | 'voided' | 'pending';

export interface Transaction {
  id: string;
  invoiceNo: string;
  userId: string;
  customerId: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  status: TransactionStatus;
  note: string | null;
  createdAt: Date;
}

// --- Transaction Item ---
export interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  qty: number;
  price: number;
  subtotal: number;
}

// --- Payment ---
export type PaymentMethod = 'cash';

export interface Payment {
  id: string;
  transactionId: string;
  method: PaymentMethod;
  amount: number;
  createdAt: Date;
}

// --- Customer ---
export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  points: number;
  createdAt: Date;
}

// --- Printer ---
export type PrinterType = 'receipt' | 'kitchen';
export type PrinterConnection = 'usb' | 'network' | 'bluetooth';

export interface Printer {
  id: string;
  name: string;
  type: PrinterType;
  connectionType: PrinterConnection;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

// --- Settings ---
export interface Setting {
  id: string;
  key: string;
  value: string;
}

// --- Expense ---
export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: Date;
  userId: string;
  createdAt: Date;
}

// --- Cash Shift ---
export type ShiftStatus = 'open' | 'closed';

export interface CashShift {
  id: string;
  userId: string;
  openAmount: number;
  closeAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  startedAt: Date;
  endedAt: Date | null;
  status: ShiftStatus;
}

// --- Audit Log ---
export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

// --- Dashboard ---
export interface DashboardStats {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  totalOrders: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  peakHours: { hour: number; count: number }[];
  revenueChart: { date: string; revenue: number }[];
  orderChart: { date: string; count: number }[];
  categoryChart: { name: string; count: number }[];
}

// --- API Response ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// --- Socket Events ---
export interface ServerToClientEvents {
  'order:new': (transaction: Transaction) => void;
  'order:status': (data: { id: string; status: TransactionStatus }) => void;
  'dashboard:update': (stats: Partial<DashboardStats>) => void;
}

export interface ClientToServerEvents {
  'order:subscribe': () => void;
  'dashboard:subscribe': () => void;
}
