// ============================================================
// POS Yoga — Drizzle Relations
// ============================================================

import { relations } from 'drizzle-orm';
import {
  user,
  session,
  account,
  categories,
  products,
  customers,
  transactions,
  transactionItems,
  payments,
  expenses,
  cashShifts,
  logs,
  productVariants,
  stockOpnameSessions,
  stockOpnameItems,
} from './schema.js';

// --- User Relations ---
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  transactions: many(transactions),
  expenses: many(expenses),
  cashShifts: many(cashShifts),
  logs: many(logs),
  stockOpnameSessions: many(stockOpnameSessions),
}));

// --- Session Relations ---
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

// --- Account Relations ---
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// --- Category Relations ---
export const categoryRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

// --- Product Relations ---
export const productRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
}));

// --- Product Variants Relations ---
export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

// --- Customer Relations ---
export const customerRelations = relations(customers, ({ many }) => ({
  transactions: many(transactions),
}));

// --- Transaction Relations ---
export const transactionRelations = relations(transactions, ({ one, many }) => ({
  user: one(user, {
    fields: [transactions.userId],
    references: [user.id],
  }),
  customer: one(customers, {
    fields: [transactions.customerId],
    references: [customers.id],
  }),
  items: many(transactionItems),
  payments: many(payments),
}));

// --- Transaction Item Relations ---
export const transactionItemRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id],
  }),
  product: one(products, {
    fields: [transactionItems.productId],
    references: [products.id],
  }),
}));

// --- Payment Relations ---
export const paymentRelations = relations(payments, ({ one }) => ({
  transaction: one(transactions, {
    fields: [payments.transactionId],
    references: [transactions.id],
  }),
}));

// --- Expense Relations ---
export const expenseRelations = relations(expenses, ({ one }) => ({
  user: one(user, {
    fields: [expenses.userId],
    references: [user.id],
  }),
}));

// --- Cash Shift Relations ---
export const cashShiftRelations = relations(cashShifts, ({ one }) => ({
  user: one(user, {
    fields: [cashShifts.userId],
    references: [user.id],
  }),
}));

// --- Log Relations ---
export const logRelations = relations(logs, ({ one }) => ({
  user: one(user, {
    fields: [logs.userId],
    references: [user.id],
  }),
}));

// --- Stock Opname Session Relations ---
export const stockOpnameSessionRelations = relations(stockOpnameSessions, ({ one, many }) => ({
  user: one(user, { fields: [stockOpnameSessions.userId], references: [user.id] }),
  items: many(stockOpnameItems),
}));

// --- Stock Opname Item Relations ---
export const stockOpnameItemRelations = relations(stockOpnameItems, ({ one }) => ({
  session: one(stockOpnameSessions, { fields: [stockOpnameItems.sessionId], references: [stockOpnameSessions.id] }),
  product: one(products, { fields: [stockOpnameItems.productId], references: [products.id] }),
}));
