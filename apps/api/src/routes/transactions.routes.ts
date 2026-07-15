// ============================================================
// POS Yoga — Transactions Routes (POS Checkout)
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, transactionItems, payments, products } from '../db/schema.js';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { INVOICE_PREFIX } from '@pos-yoga/config';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

function generateInvoiceNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${INVOICE_PREFIX}-${date}-${rand}`;
}

export async function transactionRoutes(app: FastifyInstance) {
  // Create transaction (cashier checkout)
  app.post('/api/transactions', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body as any;
    const currentUser = (req as any).user;
    const txId = nanoid();
    const invoiceNo = generateInvoiceNo();

    // Calculate totals
    let subtotal = 0;
    const items: any[] = body.items || [];
    for (const item of items) {
      subtotal += item.price * item.qty;
    }

    const discount = Number(body.discount || 0);
    const taxRate = Number(body.taxRate || 0);
    const taxAmount = ((subtotal - discount) * taxRate) / 100;
    const total = subtotal - discount + taxAmount;
    const paidAmount = Number(body.paidAmount || 0);
    const changeAmount = paidAmount - total;

    // Insert transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceNo,
      userId: currentUser.id,
      customerId: body.customerId || null,
      subtotal: String(subtotal),
      discount: String(discount),
      tax: String(taxAmount),
      total: String(total),
      paidAmount: String(paidAmount),
      changeAmount: String(changeAmount > 0 ? changeAmount : 0),
      status: 'completed',
      note: body.note || null,
    });

    // Insert items + deduct stock
    for (const item of items) {
      await db.insert(transactionItems).values({
        id: nanoid(),
        transactionId: txId,
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId || null,
        variantName: item.variantName || null,
        qty: item.qty,
        price: String(item.price),
        subtotal: String(item.price * item.qty),
      });

      // Deduct stock
      await db.update(products)
        .set({ stock: sql`${products.stock} - ${item.qty}` })
        .where(eq(products.id, item.productId));
    }

    // Insert payment
    await db.insert(payments).values({
      id: nanoid(),
      transactionId: txId,
      method: 'cash',
      amount: String(paidAmount),
    });

    await createAuditLog(req, 'transaction.created', `Invoice ${invoiceNo}, Total: ${total}`);

    // Emit socket event
    const io = (app as any).io;
    if (io) {
      io.emit('order:new', { id: txId, invoiceNo, total, items });
    }

    return reply.status(201).send({
      success: true,
      data: { id: txId, invoiceNo, total, changeAmount: changeAmount > 0 ? changeAmount : 0 },
      message: 'Transaction completed',
    });
  });

  // List transactions
  app.get('/api/transactions', { preHandler: [requireAuth] }, async (req, reply) => {
    const { page = '1', limit = '20', from, to } = req.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    let conditions: any[] = [];
    if (from) conditions.push(gte(transactions.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactions.createdAt, new Date(to)));

    const txList = await db.select().from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt))
      .limit(Number(limit))
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return reply.send({
      success: true,
      data: txList,
      total: Number(countResult[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  });

  // Get transaction detail with items
  app.get('/api/transactions/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const tx = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!tx.length) {
      return reply.status(404).send({ success: false, error: 'Transaction not found' });
    }

    const items = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, id));
    const payment = await db.select().from(payments).where(eq(payments.transactionId, id));

    return reply.send({
      success: true,
      data: { ...tx[0], items, payments: payment },
    });
  });

  // Void transaction (admin+)
  app.patch('/api/transactions/:id/void', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Restore stock
    const items = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, id));
    for (const item of items) {
      await db.update(products)
        .set({ stock: sql`${products.stock} + ${item.qty}` })
        .where(eq(products.id, item.productId));
    }

    await db.update(transactions).set({ status: 'voided' }).where(eq(transactions.id, id));
    await createAuditLog(req, 'transaction.voided', `Transaction ${id} voided`);

    return reply.send({ success: true, message: 'Transaction voided' });
  });

  // Today's transactions for cashier
  app.get('/api/transactions/today', { preHandler: [requireAuth] }, async (req, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const txList = await db.select().from(transactions)
      .where(gte(transactions.createdAt, today))
      .orderBy(desc(transactions.createdAt));

    return reply.send({ success: true, data: txList });
  });
}
