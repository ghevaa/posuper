// ============================================================
// POS Yoga — Transactions Routes (POS Checkout)
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, transactionItems, payments, products, user } from '../db/schema.js';
import { eq, desc, sql, and, gte, lte, ilike } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { INVOICE_PREFIX } from '@pos-yoga/config';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
// @ts-ignore
import midtransClient from 'midtrans-client';

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-3ABFAqq0bFUSzCNK7cQVWxl-',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-F__YPZ5Ty_h_KVOm',
});

function generateInvoiceNo(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${INVOICE_PREFIX}-${date}-${rand}`;
}

export async function transactionRoutes(app: FastifyInstance) {
  // Create transaction (cashier checkout)
  app.post('/api/transactions', { preHandler: [requireAuth] }, async (req, reply) => {
    try {
      const body = req.body as any;
      const currentUser = (req as any).user;
      const txId = nanoid();
      const invoiceNo = generateInvoiceNo();
      const paymentMethod = body.paymentMethod || 'cash';

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
      const paidAmount = Number(body.paidAmount || total);
      const changeAmount = paidAmount - total;

      // All transactions completed immediately upon checkout
      const status = 'completed';

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
        status,
        note: body.note || null,
        paymentMethod,
        orderType: body.orderType || 'dine_in',
        tableNo: body.tableNo || null,
        kitchenStatus: 'pending',
      });

      // --- Stock Validation ---
      for (const item of items) {
        if (!item.productId || item.productId.startsWith('sub_')) continue;
        const [product] = await db.select({ stock: products.stock, name: products.name })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (product && Number(product.stock) < item.qty) {
          return reply.status(400).send({
            error: `Stok "${product.name}" tidak cukup. Sisa stok: ${product.stock}, diminta: ${item.qty}`,
          });
        }
      }

      // Insert items & deduct stock
      for (const item of items) {
        // Validate if productId exists in database table
        const validProd = item.productId && !item.productId.startsWith('sub_')
          ? await db.select({ id: products.id }).from(products).where(eq(products.id, item.productId)).limit(1)
          : [];

        const validProductId = validProd.length > 0 ? item.productId : null;

        await db.insert(transactionItems).values({
          id: nanoid(),
          transactionId: txId,
          productId: validProductId,
          productName: item.productName,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          qty: item.qty,
          price: String(item.price),
          subtotal: String(item.price * item.qty),
          note: item.note || null,
        });

        // Deduct stock only for existing products
        if (validProductId) {
          await db.update(products)
            .set({ stock: sql`${products.stock} - ${item.qty}` })
            .where(eq(products.id, validProductId));
        }
      }

      // Insert payment record
      await db.insert(payments).values({
        id: nanoid(),
        transactionId: txId,
        method: paymentMethod as any,
        amount: String(paidAmount),
      });

      // For QRIS: generate Midtrans snap token
      let snapToken: string | null = null;
      let snapRedirectUrl: string | null = null;

      if (paymentMethod === 'qris') {
        const grossAmount = Math.round(total);
        if (grossAmount <= 0) {
          await db.delete(transactionItems).where(eq(transactionItems.transactionId, txId));
          await db.delete(transactions).where(eq(transactions.id, txId));
          return reply.status(400).send({
            success: false,
            error: 'Total tagihan QRIS harus lebih dari Rp 0',
          });
        }

        try {
          const midtransOrderId = `QRIS-${txId}`;

          const itemDetails: any[] = items.map((item: any, idx: number) => ({
            id: String(item.productId || `item_${idx + 1}`).substring(0, 50),
            name: String(item.productName || 'Item').substring(0, 50),
            price: Math.round(item.price),
            quantity: Number(item.qty) || 1,
          }));

          if (discount > 0) {
            itemDetails.push({
              id: 'DISCOUNT',
              name: 'Diskon Transaksi',
              price: -Math.round(discount),
              quantity: 1,
            });
          }

          // Check if sum of item_details matches gross_amount
          const sumItems = itemDetails.reduce((s, it) => s + (it.price * it.quantity), 0);
          let finalItemDetails: any[] | undefined = itemDetails;

          if (sumItems !== grossAmount) {
            const diff = grossAmount - sumItems;
            if (Math.abs(diff) <= 100) {
              itemDetails.push({
                id: 'ADJUSTMENT',
                name: 'Penyesuaian Total',
                price: diff,
                quantity: 1,
              });
            } else {
              finalItemDetails = undefined;
            }
          }

          const parameter: any = {
            transaction_details: {
              order_id: midtransOrderId,
              gross_amount: grossAmount,
            },
          };

          if (finalItemDetails) {
            parameter.item_details = finalItemDetails;
          }

          const midtransTransaction = await snap.createTransaction(parameter);
          snapToken = midtransTransaction.token;
          snapRedirectUrl = midtransTransaction.redirect_url;

          // Save snap token and order ID to transaction
          await db.update(transactions)
            .set({
              midtransOrderId,
              midtransSnapToken: snapToken,
            })
            .where(eq(transactions.id, txId));
        } catch (err: any) {
          console.error('Midtrans snap token error:', err);
          // Rollback: delete the transaction since payment setup failed
          await db.delete(transactionItems).where(eq(transactionItems.transactionId, txId));
          await db.delete(transactions).where(eq(transactions.id, txId));

          const msg = err.ApiResponse?.error_messages?.join(', ') || err.message || 'Gagal membuat QRIS';
          return reply.status(400).send({
            success: false,
            error: `Gagal membuat pembayaran QRIS: ${msg}`,
            detail: msg,
          });
        }
      }

      await createAuditLog(req, 'transaction.created', `Invoice ${invoiceNo}, Total: ${total}, Method: ${paymentMethod}`);

      // Emit socket event
      const io = (app as any).io;
      if (io) {
        io.emit('order:new', { id: txId, invoiceNo, total, items });
      }

      const responseData: any = {
        id: txId,
        invoiceNo,
        total,
        paidAmount,
        changeAmount: changeAmount > 0 ? changeAmount : 0,
        paymentMethod,
        items: items.map(i => ({ productName: i.productName, qty: i.qty, price: i.price, variantName: i.variantName || null, note: i.note || null })),
      };

      if (paymentMethod === 'qris' && snapToken) {
        responseData.midtransSnapToken = snapToken;
        responseData.snapRedirectUrl = snapRedirectUrl;
      }

      return reply.status(201).send({
        success: true,
        data: responseData,
        message: paymentMethod === 'qris' ? 'Transaction created, awaiting QRIS payment' : 'Transaction completed',
      });
    } catch (err: any) {
      console.error('Transaction creation error:', err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Gagal memproses transaksi di server',
      });
    }
  });

  // Bulk sync offline transactions
  app.post('/api/transactions/sync-bulk', { preHandler: [requireAuth] }, async (req, reply) => {
    const { transactions: offlineTxs } = req.body as { transactions: any[] };
    const currentUser = (req as any).user;

    if (!Array.isArray(offlineTxs) || offlineTxs.length === 0) {
      return reply.send({ success: true, syncedIds: [], message: 'No transactions to sync' });
    }

    const syncedIds: string[] = [];

    for (const tx of offlineTxs) {
      try {
        // Check if invoiceNo or ID already exists to avoid duplicate sync
        const existing = await db.select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.invoiceNo, tx.invoiceNo))
          .limit(1);

        if (existing.length > 0) {
          syncedIds.push(tx.id);
          continue;
        }

        const txId = tx.id || nanoid();
        const invoiceNo = tx.invoiceNo || generateInvoiceNo();
        const paymentMethod = tx.paymentMethod || 'cash';
        const subtotal = Number(tx.subtotal || 0);
        const discount = Number(tx.discount || 0);
        const taxAmount = Number(tx.tax || 0);
        const total = Number(tx.total || subtotal - discount + taxAmount);
        const paidAmount = Number(tx.paidAmount || total);
        const changeAmount = Number(tx.changeAmount || 0);
        const items = tx.items || [];

        // Insert transaction with status completed
        await db.insert(transactions).values({
          id: txId,
          invoiceNo,
          userId: tx.userId || currentUser.id,
          subtotal: String(subtotal),
          discount: String(discount),
          tax: String(taxAmount),
          total: String(total),
          paidAmount: String(paidAmount),
          changeAmount: String(changeAmount > 0 ? changeAmount : 0),
          status: 'completed',
          note: tx.note || 'Synced Offline Transaction',
          paymentMethod,
          createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        });

        // Insert items & deduct stock
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
          method: paymentMethod,
          amount: String(paidAmount),
          createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
        });

        syncedIds.push(tx.id);
      } catch (err: any) {
        console.error(`Failed to sync offline transaction ${tx.invoiceNo}:`, err);
      }
    }

    return reply.send({
      success: true,
      syncedIds,
      message: `${syncedIds.length} of ${offlineTxs.length} transactions synced successfully`,
    });
  });

  // Helper: build date range from preset
  function getDateRange(dateFilter: string, from?: string, to?: string): { start?: Date; end?: Date } {
    const now = new Date();
    const startOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
    const endOfDay = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };

    switch (dateFilter) {
      case 'today':
        return { start: startOfDay(new Date(now)), end: endOfDay(new Date(now)) };
      case 'yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return { start: startOfDay(y), end: endOfDay(new Date(y)) };
      }
      case 'this_week': {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay());
        return { start: startOfDay(d), end: endOfDay(new Date(now)) };
      }
      case 'last_week': {
        const d = new Date(now); d.setDate(d.getDate() - d.getDay() - 7);
        const e = new Date(d); e.setDate(e.getDate() + 6);
        return { start: startOfDay(d), end: endOfDay(e) };
      }
      case 'this_month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: startOfDay(d), end: endOfDay(new Date(now)) };
      }
      case 'last_month': {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start: startOfDay(d), end: endOfDay(e) };
      }
      case 'custom':
        return {
          start: from ? new Date(from) : undefined,
          end: to ? endOfDay(new Date(to)) : undefined,
        };
      default: // 'all' or unset
        return { start: from ? new Date(from) : undefined, end: to ? endOfDay(new Date(to)) : undefined };
    }
  }

  // Helper: build filter conditions
  function buildFilterConditions(query: any) {
    const { dateFilter, from, to, status, orderType, paymentMethod, invoiceNo, userId } = query;
    const conditions: any[] = [];

    const range = getDateRange(dateFilter || '', from, to);
    if (range.start) conditions.push(gte(transactions.createdAt, range.start));
    if (range.end) conditions.push(lte(transactions.createdAt, range.end));
    if (status) conditions.push(eq(transactions.status, status));
    if (orderType) conditions.push(eq(transactions.orderType, orderType));
    if (paymentMethod) conditions.push(eq(transactions.paymentMethod, paymentMethod));
    if (invoiceNo) conditions.push(ilike(transactions.invoiceNo, `%${invoiceNo}%`));
    if (userId) conditions.push(eq(transactions.userId, userId));

    return conditions;
  }

  // List transactions (with filters, pagination, and user name)
  app.get('/api/transactions', { preHandler: [requireAuth] }, async (req, reply) => {
    const query = req.query as any;
    const page = Number(query.page || '1');
    const limit = Number(query.limit || '50');
    const offset = (page - 1) * limit;

    const conditions = buildFilterConditions(query);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const txList = await db.select({
      id: transactions.id,
      invoiceNo: transactions.invoiceNo,
      userId: transactions.userId,
      userName: user.name,
      subtotal: transactions.subtotal,
      discount: transactions.discount,
      tax: transactions.tax,
      total: transactions.total,
      paidAmount: transactions.paidAmount,
      changeAmount: transactions.changeAmount,
      status: transactions.status,
      paymentMethod: transactions.paymentMethod,
      orderType: transactions.orderType,
      tableNo: transactions.tableNo,
      note: transactions.note,
      createdAt: transactions.createdAt,
    }).from(transactions)
      .leftJoin(user, eq(transactions.userId, user.id))
      .where(whereClause)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(transactions)
      .where(whereClause);

    // Aggregate total per date and per user
    const summaryByDate = await db.select({
      date: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
      totalAmount: sql<number>`SUM(CAST(${transactions.total} AS NUMERIC))`,
      count: sql<number>`COUNT(*)`,
    }).from(transactions)
      .where(whereClause)
      .groupBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD') DESC`);

    const summaryByUser = await db.select({
      userId: transactions.userId,
      userName: user.name,
      totalAmount: sql<number>`SUM(CAST(${transactions.total} AS NUMERIC))`,
      count: sql<number>`COUNT(*)`,
    }).from(transactions)
      .leftJoin(user, eq(transactions.userId, user.id))
      .where(whereClause)
      .groupBy(transactions.userId, user.name);

    const grandTotal = summaryByDate.reduce((s, r) => s + Number(r.totalAmount || 0), 0);

    return reply.send({
      success: true,
      data: txList,
      total: Number(countResult[0].count),
      page,
      limit,
      summaryByDate,
      summaryByUser,
      grandTotal,
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
      if (!item.productId) continue;
      await db.update(products)
        .set({ stock: sql`${products.stock} + ${item.qty}` })
        .where(eq(products.id, item.productId));
    }

    await db.update(transactions).set({ status: 'voided' }).where(eq(transactions.id, id));
    await createAuditLog(req, 'transaction.voided', `Transaction ${id} voided`);

    return reply.send({ success: true, message: 'Transaction voided' });
  });

  // Today's transactions for cashier (with optional filters)
  app.get('/api/transactions/today', { preHandler: [requireAuth] }, async (req, reply) => {
    const query = req.query as any;
    const currentUser = (req as any).user;

    // Default to today if no dateFilter specified
    const dateFilter = query.dateFilter || 'today';
    const conditions = buildFilterConditions({ ...query, dateFilter });

    // Cashiers only see their own transactions (unless admin/developer)
    if (currentUser.role === 'cashier') {
      conditions.push(eq(transactions.userId, currentUser.id));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const txList = await db.select({
      id: transactions.id,
      invoiceNo: transactions.invoiceNo,
      userId: transactions.userId,
      userName: user.name,
      subtotal: transactions.subtotal,
      discount: transactions.discount,
      tax: transactions.tax,
      total: transactions.total,
      paidAmount: transactions.paidAmount,
      changeAmount: transactions.changeAmount,
      status: transactions.status,
      paymentMethod: transactions.paymentMethod,
      orderType: transactions.orderType,
      tableNo: transactions.tableNo,
      note: transactions.note,
      createdAt: transactions.createdAt,
    }).from(transactions)
      .leftJoin(user, eq(transactions.userId, user.id))
      .where(whereClause)
      .orderBy(desc(transactions.createdAt));

    // Summary totals
    const grandTotal = txList.reduce((s, r) => s + Number(r.total || 0), 0);

    return reply.send({ success: true, data: txList, grandTotal, count: txList.length });
  });

  // Today's transactions WITH items — for Kitchen Display
  app.get('/api/transactions/today-all', { preHandler: [requireAuth] }, async (req, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const txList = await db.select().from(transactions)
      .where(and(
        gte(transactions.createdAt, today),
        eq(transactions.status, 'completed'),
      ))
      .orderBy(desc(transactions.createdAt));

    // Fetch items for each transaction
    const txWithItems = await Promise.all(txList.map(async (tx) => {
      const items = await db.select({
        id: transactionItems.id,
        productName: transactionItems.productName,
        variantName: transactionItems.variantName,
        qty: transactionItems.qty,
        note: transactionItems.note,
      }).from(transactionItems).where(eq(transactionItems.transactionId, tx.id));
      return { ...tx, items };
    }));

    return reply.send({ success: true, data: txWithItems });
  });

  // Update kitchen status ('pending' | 'processing' | 'completed')
  app.patch('/api/transactions/:id/kitchen-status', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { kitchenStatus } = req.body as { kitchenStatus: string };

    if (!['pending', 'processing', 'completed'].includes(kitchenStatus)) {
      return reply.status(400).send({ success: false, error: 'Status dapur tidak valid' });
    }

    await db.update(transactions)
      .set({ kitchenStatus: kitchenStatus as any })
      .where(eq(transactions.id, id));

    const io = (app as any).io;
    if (io) {
      io.emit('order:kitchen-status', { id, kitchenStatus });
    }

    return reply.send({ success: true, message: 'Status pesanan dapur diperbarui', data: { id, kitchenStatus } });
  });

  // Get closing summary for cashier shift
  app.get('/api/transactions/closing-summary', { preHandler: [requireAuth] }, async (req, reply) => {
    try {
      const { date } = req.query as { date?: string };
      const targetDate = date ? new Date(date) : new Date();

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const todaysTx = await db.select()
        .from(transactions)
        .where(
          and(
            gte(transactions.createdAt, startOfDay),
            lte(transactions.createdAt, endOfDay),
            eq(transactions.status, 'completed')
          )
        )
        .orderBy(desc(transactions.createdAt));

      let totalOmset = 0;
      let totalCash = 0;
      let totalQris = 0;
      let totalTransfer = 0;
      let totalNonCash = 0;
      let totalDiscount = 0;
      const totalTxCount = todaysTx.length;

      for (const tx of todaysTx) {
        const total = Number(tx.total);
        const discount = Number(tx.discount);
        totalOmset += total;
        totalDiscount += discount;

        if (tx.paymentMethod === 'cash') {
          totalCash += total;
        } else if (tx.paymentMethod === 'qris') {
          totalQris += total;
          totalNonCash += total;
        } else if (tx.paymentMethod === 'transfer') {
          totalTransfer += total;
          totalNonCash += total;
        } else {
          totalNonCash += total;
        }
      }

      return reply.send({
        success: true,
        data: {
          date: startOfDay.toISOString(),
          totalTxCount,
          totalOmset,
          totalCash,
          totalQris,
          totalTransfer,
          totalNonCash,
          totalDiscount,
          transactions: todaysTx,
        },
      });
    } catch (err: any) {
      console.error('Closing summary error:', err);
      return reply.status(500).send({ success: false, error: 'Gagal mengambil data closing' });
    }
  });
}
