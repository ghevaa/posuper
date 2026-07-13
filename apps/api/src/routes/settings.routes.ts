// ============================================================
// POS Yoga — Settings Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { settings, printers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function settingsRoutes(app: FastifyInstance) {
  // Get all settings
  app.get('/api/settings', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const all = await db.select().from(settings);
    const map: Record<string, string> = {};
    for (const s of all) map[s.key] = s.value;
    return reply.send({ success: true, data: map });
  });

  // Update settings (bulk)
  app.put('/api/settings', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const body = req.body as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      if (existing.length) {
        await db.update(settings).set({ value }).where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ id: nanoid(), key, value });
      }
    }

    await createAuditLog(req, 'settings.updated', `Updated ${Object.keys(body).length} settings`);
    return reply.send({ success: true, message: 'Settings updated' });
  });

  // --- Printers ---
  app.get('/api/printers', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const all = await db.select().from(printers);
    return reply.send({ success: true, data: all });
  });

  app.post('/api/printers', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const body = req.body as any;
    const id = nanoid();
    await db.insert(printers).values({
      id,
      name: body.name,
      type: body.type,
      connectionType: body.connectionType || 'usb',
      address: body.address || null,
      isDefault: body.isDefault || false,
      isActive: true,
    });
    await createAuditLog(req, 'printer.created', `Printer ${body.name}`);
    return reply.status(201).send({ success: true, data: { id } });
  });

  app.put('/api/printers/:id', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    await db.update(printers).set(body).where(eq(printers.id, id));
    return reply.send({ success: true, message: 'Printer updated' });
  });

  app.delete('/api/printers/:id', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(printers).where(eq(printers.id, id));
    return reply.send({ success: true, message: 'Printer deleted' });
  });
}
