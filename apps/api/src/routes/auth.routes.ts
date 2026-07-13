// ============================================================
// POS Yoga — Auth Routes (Better Auth handler)
// ============================================================

import type { FastifyInstance } from 'fastify';
import { auth } from '../auth.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
import { db } from '../db/index.js';
import { user } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function authRoutes(app: FastifyInstance) {
  // Better Auth catch-all handler
  app.all('/auth/*', async (req, reply) => {
    const url = new URL(req.url, `http://${req.hostname}`);
    const response = await auth.handler(new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    }));

    // Forward response headers
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    reply.status(response.status);
    const text = await response.text();
    return reply.send(text);
  });

  // Get current user
  app.get('/api/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const currentUser = (req as any).user;
    return reply.send({ success: true, data: currentUser });
  });

  // List all users (admin+)
  app.get('/api/users', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const users = await db.select().from(user);
    const safeUsers = users.map(({ ...u }) => u);
    return reply.send({ success: true, data: safeUsers });
  });

  // Update user role (developer only)
  app.patch('/api/users/:id/role', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role: newRole } = req.body as { role: string };

    if (!['developer', 'admin', 'cashier'].includes(newRole)) {
      return reply.status(400).send({ success: false, error: 'Invalid role' });
    }

    await db.update(user).set({ role: newRole as any }).where(eq(user.id, id));
    await createAuditLog(req, 'user.role_updated', `User ${id} → ${newRole}`);
    return reply.send({ success: true, message: 'Role updated' });
  });

  // Delete user (developer only)
  app.delete('/api/users/:id', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    if (id === currentUser.id) {
      return reply.status(400).send({ success: false, error: 'Cannot delete yourself' });
    }

    await db.delete(user).where(eq(user.id, id));
    await createAuditLog(req, 'user.deleted', `User ${id} deleted`);
    return reply.send({ success: true, message: 'User deleted' });
  });
}
