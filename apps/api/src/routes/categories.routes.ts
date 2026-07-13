// ============================================================
// POS Yoga — Categories Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { categories } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function categoryRoutes(app: FastifyInstance) {
  // List categories
  app.get('/api/categories', { preHandler: [requireAuth] }, async (req, reply) => {
    const allCategories = await db.select().from(categories);
    return reply.send({ success: true, data: allCategories });
  });

  // Create category (admin+)
  app.post('/api/categories', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const body = req.body as any;
    const id = nanoid();

    await db.insert(categories).values({
      id,
      name: body.name,
      icon: body.icon || null,
      color: body.color || null,
    });

    await createAuditLog(req, 'category.created', `Category ${body.name}`);
    return reply.status(201).send({ success: true, data: { id }, message: 'Category created' });
  });

  // Update category (admin+)
  app.put('/api/categories/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    await db.update(categories).set({
      name: body.name,
      icon: body.icon,
      color: body.color,
    }).where(eq(categories.id, id));

    await createAuditLog(req, 'category.updated', `Category ${id}`);
    return reply.send({ success: true, message: 'Category updated' });
  });

  // Delete category (admin+)
  app.delete('/api/categories/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(categories).where(eq(categories.id, id));
    await createAuditLog(req, 'category.deleted', `Category ${id}`);
    return reply.send({ success: true, message: 'Category deleted' });
  });
}
