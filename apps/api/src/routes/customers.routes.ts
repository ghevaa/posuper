// ============================================================
// POS Yoga — Customers Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { customers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export async function customerRoutes(app: FastifyInstance) {
  app.get('/api/customers', { preHandler: [requireAuth] }, async (req, reply) => {
    const all = await db.select().from(customers);
    return reply.send({ success: true, data: all });
  });

  app.post('/api/customers', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body as any;
    const id = nanoid();
    await db.insert(customers).values({
      id,
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
    });
    return reply.status(201).send({ success: true, data: { id } });
  });

  app.put('/api/customers/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    await db.update(customers).set({
      name: body.name,
      phone: body.phone,
      email: body.email,
    }).where(eq(customers.id, id));
    return reply.send({ success: true, message: 'Customer updated' });
  });

  app.delete('/api/customers/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(customers).where(eq(customers.id, id));
    return reply.send({ success: true, message: 'Customer deleted' });
  });
}
