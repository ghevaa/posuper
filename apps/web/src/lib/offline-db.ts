// ============================================================
// POS Yoga — Offline IndexedDB (Dexie.js)
// ============================================================

import Dexie, { type Table } from 'dexie';

export interface OfflineProduct {
  id: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  barcode?: string | null;
  sku?: string | null;
  categoryId?: string | null;
  image?: string | null;
  variants?: Array<{
    id: string;
    productId: string;
    name: string;
    additionalPrice: number;
  }>;
  isActive: boolean;
}

export interface OfflineCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

export interface PendingTransactionItem {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  variantId?: string | null;
  variantName?: string | null;
}

export interface PendingTransaction {
  id: string;
  invoiceNo: string;
  userId?: string;
  items: PendingTransactionItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: string;
  note?: string | null;
  createdAt: string;
  status: 'pending_sync' | 'syncing' | 'error';
  errorMessage?: string;
}

class PosYogaOfflineDB extends Dexie {
  products!: Table<OfflineProduct, string>;
  categories!: Table<OfflineCategory, string>;
  pendingTransactions!: Table<PendingTransaction, string>;

  constructor() {
    super('PosYogaOfflineDB');
    this.version(1).stores({
      products: 'id, name, categoryId, isActive',
      categories: 'id, name',
      pendingTransactions: 'id, invoiceNo, createdAt, status',
    });
  }
}

export const offlineDB = new PosYogaOfflineDB();

// --- Helper Functions to Cache Products & Categories ---

export async function cacheProductsAndCategories(products: OfflineProduct[], categories: OfflineCategory[]) {
  try {
    await offlineDB.transaction('rw', [offlineDB.products, offlineDB.categories], async () => {
      await offlineDB.products.clear();
      await offlineDB.products.bulkPut(products);
      await offlineDB.categories.clear();
      await offlineDB.categories.bulkPut(categories);
    });
  } catch (err) {
    console.error('Failed to cache products/categories in IndexedDB:', err);
  }
}

export async function getLocalProducts(): Promise<OfflineProduct[]> {
  try {
    return await offlineDB.products.toArray();
  } catch (err) {
    console.error('Failed to read local products:', err);
    return [];
  }
}

export async function getLocalCategories(): Promise<OfflineCategory[]> {
  try {
    return await offlineDB.categories.toArray();
  } catch (err) {
    console.error('Failed to read local categories:', err);
    return [];
  }
}
