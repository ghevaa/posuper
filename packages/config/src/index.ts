// ============================================================
// POS Yoga — Shared Configuration
// ============================================================

export const APP_NAME = 'POS Yoga';
export const APP_VERSION = '1.0.0';

// --- API ---
export const API_PORT = 3000;
export const API_HOST = '0.0.0.0';
export const API_PREFIX = '/api';

// --- Roles ---
export const ROLES = {
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  CASHIER: 'cashier',
} as const;

export const ROLE_HIERARCHY: Record<string, number> = {
  developer: 3,
  admin: 2,
  cashier: 1,
};

// --- Default Settings Keys ---
export const SETTINGS_KEYS = {
  STORE_NAME: 'store_name',
  STORE_ADDRESS: 'store_address',
  STORE_PHONE: 'store_phone',
  STORE_LOGO: 'store_logo',
  TAX_RATE: 'tax_rate',
  TAX_ENABLED: 'tax_enabled',
  CURRENCY: 'currency',
  RECEIPT_HEADER: 'receipt_header',
  RECEIPT_FOOTER: 'receipt_footer',
} as const;

// --- Default Settings Values ---
export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTINGS_KEYS.STORE_NAME]: 'POS Yoga',
  [SETTINGS_KEYS.STORE_ADDRESS]: '',
  [SETTINGS_KEYS.STORE_PHONE]: '',
  [SETTINGS_KEYS.STORE_LOGO]: '',
  [SETTINGS_KEYS.TAX_RATE]: '0',
  [SETTINGS_KEYS.TAX_ENABLED]: 'false',
  [SETTINGS_KEYS.CURRENCY]: 'IDR',
  [SETTINGS_KEYS.RECEIPT_HEADER]: 'Terima Kasih',
  [SETTINGS_KEYS.RECEIPT_FOOTER]: 'Barang yang sudah dibeli tidak dapat dikembalikan',
};

// --- Pagination ---
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// --- Printer ---
export const PRINTER_PAPER_WIDTH = {
  '58mm': 32,
  '80mm': 48,
} as const;

// --- Invoice ---
export const INVOICE_PREFIX = 'INV';

// --- Date Formats ---
export const DATE_FORMAT = 'dd/MM/yyyy';
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';
export const TIME_FORMAT = 'HH:mm';
