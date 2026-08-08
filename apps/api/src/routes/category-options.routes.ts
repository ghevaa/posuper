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
      const primaryCatId = group.categoryId || (Array.isArray(group.categoryIds) ? group.categoryIds[0] : null);
      const cat = primaryCatId ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, primaryCatId)).limit(1) : [];
      return {
        ...group,
        categoryName: cat[0]?.name || (Array.isArray(group.categoryIds) && group.categoryIds.includes('all') ? 'Semua Kategori' : ''),
        options,
      };
    }));

    return reply.send({ success: true, data: result });
  });

  // Get option groups for a category
  app.get('/api/categories/:categoryId/option-groups', async (req, reply) => {
    const { categoryId } = req.params as { categoryId: string };
    const allGroups = await db.select().from(categoryOptionGroups);
    const groups = allGroups.filter(g => {
      if (g.categoryId === categoryId) return true;
      if (Array.isArray(g.categoryIds)) {
        return g.categoryIds.includes(categoryId) || g.categoryIds.includes('all');
      }
      return false;
    });

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
    const { name, categoryId, categoryIds, isRequired, isMultiple, minSelect, maxSelect, options } = req.body as any;

    const catIds = Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : (categoryId ? [categoryId] : []);

    if (!name || catIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'Nama grup opsi dan minimal 1 kategori terkait wajib diisi' });
    }

    const groupId = nanoid();

    await db.insert(categoryOptionGroups).values({
      id: groupId,
      name,
      categoryId: catIds[0] !== 'all' ? catIds[0] : null,
      categoryIds: catIds,
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
            cost: String(opt.cost || 0),
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
    const { name, categoryId, categoryIds, isRequired, isMultiple, minSelect, maxSelect, options } = req.body as any;

    const catIds = Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : (categoryId ? [categoryId] : []);

    await db.update(categoryOptionGroups)
      .set({
        name,
        categoryId: catIds[0] !== 'all' ? catIds[0] : null,
        categoryIds: catIds,
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
            cost: String(opt.cost || 0),
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
