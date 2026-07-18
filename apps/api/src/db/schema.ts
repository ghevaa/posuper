// ============================================================
// POS Yoga — Database Schema (Drizzle ORM + PostgreSQL)
// ============================================================

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// --- Enums ---
export const roleEnum = pgEnum('role', ['developer', 'admin', 'cashier']);
export const transactionStatusEnum = pgEnum('transaction_status', ['completed', 'voided', 'pending']);
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'qris']);
export const printerTypeEnum = pgEnum('printer_type', ['receipt', 'kitchen']);
export const printerConnectionEnum = pgEnum('printer_connection', ['usb', 'network', 'bluetooth']);
export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed']);

// --- Better Auth: user ---
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: roleEnum('role').notNull().default('cashier'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

// --- Better Auth: session ---
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

// --- Better Auth: account ---
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

// --- Better Auth: verification ---
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// --- Categories ---
export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Products ---
export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull().default('0'),
    stock: integer('stock').notNull().default(0),
    image: text('image'),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index('products_barcode_idx').on(table.barcode),
    index('products_categoryId_idx').on(table.categoryId),
  ],
);

// --- Product Variants ---
export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    additionalPrice: numeric('additional_price', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index('product_variants_productId_idx').on(table.productId),
  ],
);

// --- Customers ---
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  points: integer('points').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Transactions ---
export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    invoiceNo: text('invoice_no').notNull().unique(),
    userId: text('user_id').notNull().references(() => user.id),
    customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    changeAmount: numeric('change_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    status: transactionStatusEnum('status').notNull().default('completed'),
    note: text('note'),
    paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
    midtransOrderId: text('midtrans_order_id'),
    midtransSnapToken: text('midtrans_snap_token'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('transactions_userId_idx').on(table.userId),
    index('transactions_createdAt_idx').on(table.createdAt),
  ],
);

// --- Transaction Items ---
export const transactionItems = pgTable(
  'transaction_items',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull().references(() => products.id),
    productName: text('product_name').notNull(),
    variantId: text('variant_id'),
    variantName: text('variant_name'),
    qty: integer('qty').notNull().default(1),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [index('transaction_items_transactionId_idx').on(table.transactionId)],
);

// --- Payments ---
export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum('method').notNull().default('cash'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('payments_transactionId_idx').on(table.transactionId)],
);

// --- Printers ---
export const printers = pgTable('printers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: printerTypeEnum('type').notNull(),
  connectionType: printerConnectionEnum('connection_type').notNull().default('usb'),
  address: text('address'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

// --- Settings ---
export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull().default(''),
});

// --- Expenses ---
export const expenses = pgTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    date: timestamp('date').notNull(),
    userId: text('user_id').notNull().references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('expenses_date_idx').on(table.date)],
);

// --- Cash Shifts ---
export const cashShifts = pgTable(
  'cash_shifts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id),
    openAmount: numeric('open_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    closeAmount: numeric('close_amount', { precision: 12, scale: 2 }),
    expectedAmount: numeric('expected_amount', { precision: 12, scale: 2 }),
    difference: numeric('difference', { precision: 12, scale: 2 }),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    status: shiftStatusEnum('status').notNull().default('open'),
  },
  (table) => [index('cash_shifts_userId_idx').on(table.userId)],
);

// --- Audit Logs ---
export const logs = pgTable(
  'logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    detail: text('detail'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('logs_createdAt_idx').on(table.createdAt)],
);

// --- Stock Opname Sessions ---
export const stockOpnameSessions = pgTable(
  'stock_opname_sessions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    date: timestamp('date').notNull(),
    userId: text('user_id').notNull().references(() => user.id),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('stock_opname_sessions_date_idx').on(table.date)],
);

// --- Stock Opname Items ---
export const stockOpnameItems = pgTable(
  'stock_opname_items',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => stockOpnameSessions.id, { onDelete: 'cascade' }),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    unit: text('unit').notNull().default('Pcs'),
    stockStart: integer('stock_start').notNull().default(0),
    stockIn: integer('stock_in').notNull().default(0),
    stockReal: integer('stock_real').notNull().default(0),
    usage: integer('usage').notNull().default(0),
    waste: integer('waste').notNull().default(0),
    notes: text('notes'),
  },
  (table) => [index('stock_opname_items_sessionId_idx').on(table.sessionId)],
);
