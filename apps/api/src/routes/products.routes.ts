// ============================================================
// POS Yoga — Products Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { products } from '../db/schema.js';
import { eq, ilike, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function productRoutes(app: FastifyInstance) {
  // List products (all authenticated)
  app.get('/api/products', { preHandler: [requireAuth] }, async (req, reply) => {
    const { search, categoryId, page = '1', limit = '20' } = req.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    let query = db.select().from(products).orderBy(desc(products.createdAt));

    const allProducts = await query.limit(Number(limit)).offset(offset);
    return reply.send({ success: true, data: allProducts });
  });

  // Search by barcode
  app.get('/api/products/barcode/:barcode', { preHandler: [requireAuth] }, async (req, reply) => {
    const { barcode } = req.params as { barcode: string };
    const product = await db.select().from(products).where(eq(products.barcode, barcode)).limit(1);

    if (!product.length) {
      return reply.status(404).send({ success: false, error: 'Product not found' });
    }
    return reply.send({ success: true, data: product[0] });
  });

  // Get single product
  app.get('/api/products/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await db.select().from(products).where(eq(products.id, id)).limit(1);

    if (!product.length) {
      return reply.status(404).send({ success: false, error: 'Product not found' });
    }
    return reply.send({ success: true, data: product[0] });
  });

  // Create product (admin+)
  app.post('/api/products', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const body = req.body as any;
    const id = nanoid();

    await db.insert(products).values({
      id,
      name: body.name,
      sku: body.sku || null,
      barcode: body.barcode || null,
      price: String(body.price || 0),
      cost: String(body.cost || 0),
      stock: body.stock || 0,
      image: body.image || null,
      categoryId: body.categoryId || null,
      isActive: body.isActive ?? true,
    });

    await createAuditLog(req, 'product.created', `Product ${body.name} created`);
    return reply.status(201).send({ success: true, data: { id }, message: 'Product created' });
  });

  // Update product (admin+)
  app.put('/api/products/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.sku !== undefined) updates.sku = body.sku;
    if (body.barcode !== undefined) updates.barcode = body.barcode;
    if (body.price !== undefined) updates.price = String(body.price);
    if (body.cost !== undefined) updates.cost = String(body.cost);
    if (body.stock !== undefined) updates.stock = body.stock;
    if (body.image !== undefined) updates.image = body.image;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    await db.update(products).set(updates).where(eq(products.id, id));
    await createAuditLog(req, 'product.updated', `Product ${id} updated`);
    return reply.send({ success: true, message: 'Product updated' });
  });

  // Delete product (admin+)
  app.delete('/api/products/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
    await createAuditLog(req, 'product.deleted', `Product ${id} soft-deleted`);
    return reply.send({ success: true, message: 'Product deleted' });
  });
}
