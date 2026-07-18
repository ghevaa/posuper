// ============================================================
// POS Yoga — Midtrans QRIS Payment Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, transactionItems, payments, products, logs } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth } from '../middleware/auth.middleware.js';
// @ts-ignore
import midtransClient from 'midtrans-client';

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-3ABFAqq0bFUSzCNK7cQVWxl-',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-F__YPZ5Ty_h_KVOm',
});

export async function midtransRoutes(app: FastifyInstance) {
  // Generate Snap token for QRIS payment
  app.post('/api/midtrans/snap-token', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body as {
      orderId: string;
      grossAmount: number;
      items: { id: string; name: string; price: number; qty: number }[];
    };

    const parameter = {
      transaction_details: {
        order_id: body.orderId,
        gross_amount: body.grossAmount,
      },
      item_details: body.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.qty,
      })),
    };

    try {
      const transaction = await snap.createTransaction(parameter);

      return reply.send({
        success: true,
        data: {
          token: transaction.token,
          redirectUrl: transaction.redirect_url,
        },
      });
    } catch (err: any) {
      console.error('Midtrans snap token error:', err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create Midtrans transaction',
        detail: err.message,
      });
    }
  });

  // Midtrans payment notification webhook (no auth — called by Midtrans servers)
  app.post('/api/midtrans/notification', async (req, reply) => {
    const body = req.body as any;

    try {
      const notification = await snap.transaction.notification(body);

      const orderId = notification.order_id;
      const transactionStatus = notification.transaction_status;
      const fraudStatus = notification.fraud_status;

      console.log(`[Midtrans Webhook] order_id: ${orderId}, status: ${transactionStatus}, fraud: ${fraudStatus}`);

      // Find the transaction by midtransOrderId
      const txList = await db.select().from(transactions)
        .where(eq(transactions.midtransOrderId, orderId))
        .limit(1);

      if (!txList.length) {
        console.warn(`[Midtrans Webhook] Transaction not found for order_id: ${orderId}`);
        return reply.send({ success: false, error: 'Transaction not found' });
      }

      const tx = txList[0];

      if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
        // Only process if fraud status is acceptable
        if (transactionStatus === 'capture' && fraudStatus !== 'accept') {
          console.warn(`[Midtrans Webhook] Fraud detected for order_id: ${orderId}`);
          return reply.send({ success: true, message: 'Fraud detected, skipping' });
        }

        // Update transaction status to completed
        await db.update(transactions)
          .set({ status: 'completed' })
          .where(eq(transactions.id, tx.id));

        // Insert payment record
        await db.insert(payments).values({
          id: nanoid(),
          transactionId: tx.id,
          method: 'qris',
          amount: tx.total,
        });

        // Audit log
        await db.insert(logs).values({
          id: nanoid(),
          userId: tx.userId,
          action: 'midtrans.settlement',
          detail: `QRIS payment settled for order ${orderId}, invoice ${tx.invoiceNo}`,
          ipAddress: req.ip,
        });

        console.log(`[Midtrans Webhook] Transaction ${tx.invoiceNo} completed via QRIS`);
      } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
        // Update transaction status to voided
        await db.update(transactions)
          .set({ status: 'voided' })
          .where(eq(transactions.id, tx.id));

        // Restore stock for each item (stock was not deducted for QRIS pending, but handle just in case)
        const items = await db.select().from(transactionItems)
          .where(eq(transactionItems.transactionId, tx.id));

        for (const item of items) {
          await db.update(products)
            .set({ stock: sql`${products.stock} + ${item.qty}` })
            .where(eq(products.id, item.productId));
        }

        // Audit log
        await db.insert(logs).values({
          id: nanoid(),
          userId: tx.userId,
          action: 'midtrans.failed',
          detail: `QRIS payment ${transactionStatus} for order ${orderId}, invoice ${tx.invoiceNo}`,
          ipAddress: req.ip,
        });

        console.log(`[Midtrans Webhook] Transaction ${tx.invoiceNo} voided (${transactionStatus})`);
      }

      return reply.send({ success: true, message: 'Notification processed' });
    } catch (err: any) {
      console.error('[Midtrans Webhook] Error processing notification:', err);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process notification',
        detail: err.message,
      });
    }
  });
}
