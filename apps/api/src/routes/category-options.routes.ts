// ============================================================
// POS Yoga — Category Option Groups & Options Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { categoryOptionGroups, categoryOptions, categories } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function categoryOptionsRoutes(app: FastifyInstance) {
  // Get all option groups with options
  app.get('/api/category-option-groups', async (req, reply) => {
    const groups = await db.select().from(categoryOptionGroups).orderBy(desc(categoryOptionGroups.createdAt));
    
    const result = await Promise.all(groups.map(async (group) => {
      const options = await db.select().from(categoryOptions).where(eq(categoryOptions.groupId, group.id));
      const cat = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, group.categoryId)).limit(1);
      return {
        ...group,
        categoryName: cat[0]?.name || '',
        options,
      };
    }));

    return reply.send({ success: true, data: result });
  });

  // Get option groups for a category
  app.get('/api/categories/:categoryId/option-groups', async (req, reply) => {
    const { categoryId } = req.params as { categoryId: string };
    const groups = await db.select().from(categoryOptionGroups).where(eq(categoryOptionGroups.categoryId, categoryId));

    const result = await Promise.all(groups.map(async (group) => {
      const options = await db.select().from(categoryOptions).where(eq(categoryOptions.groupId, group.id));
      return {
        ...group,
        options,
      };
    }));

    return reply.send({ success: true, data: result });
  });

  // Create option group with options (admin+)
  app.post('/api/category-option-groups', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { name, categoryId, isRequired, isMultiple, minSelect, maxSelect, options } = req.body as any;

    if (!name || !categoryId) {
      return reply.status(400).send({ success: false, error: 'Nama grup opsi dan kategori wajib diisi' });
    }

    const groupId = nanoid();

    await db.insert(categoryOptionGroups).values({
      id: groupId,
      name,
      categoryId,
      isRequired: Boolean(isRequired),
      isMultiple: Boolean(isMultiple),
      minSelect: Number(minSelect || 0),
      maxSelect: Number(maxSelect || 1),
    });

    if (Array.isArray(options) && options.length > 0) {
      for (const opt of options) {
        if (opt.name) {
          await db.insert(categoryOptions).values({
            id: nanoid(),
            groupId,
            name: opt.name,
            price: String(opt.price || 0),
          });
        }
      }
    }

    await createAuditLog(req, 'option_group.created', `Created option group ${name}`);

    return reply.status(201).send({ success: true, message: 'Grup opsi berhasil dibuat', data: { id: groupId } });
  });

  // Update option group with options (admin+)
  app.put('/api/category-option-groups/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name, categoryId, isRequired, isMultiple, minSelect, maxSelect, options } = req.body as any;

    await db.update(categoryOptionGroups)
      .set({
        name,
        categoryId,
        isRequired: Boolean(isRequired),
        isMultiple: Boolean(isMultiple),
        minSelect: Number(minSelect || 0),
        maxSelect: Number(maxSelect || 1),
      })
      .where(eq(categoryOptionGroups.id, id));

    // Delete existing options & re-insert
    await db.delete(categoryOptions).where(eq(categoryOptions.groupId, id));

    if (Array.isArray(options) && options.length > 0) {
      for (const opt of options) {
        if (opt.name) {
          await db.insert(categoryOptions).values({
            id: nanoid(),
            groupId: id,
            name: opt.name,
            price: String(opt.price || 0),
          });
        }
      }
    }

    await createAuditLog(req, 'option_group.updated', `Updated option group ${id}`);

    return reply.send({ success: true, message: 'Grup opsi diperbarui' });
  });

  // Delete option group (admin+)
  app.delete('/api/category-option-groups/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    await db.delete(categoryOptions).where(eq(categoryOptions.groupId, id));
    await db.delete(categoryOptionGroups).where(eq(categoryOptionGroups.id, id));

    await createAuditLog(req, 'option_group.deleted', `Deleted option group ${id}`);

    return reply.send({ success: true, message: 'Grup opsi dihapus' });
  });
}
