// ============================================================
// POS Yoga — Auth Middleware
// ============================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { auth } from '../auth.js';
import type { Role } from '@pos-yoga/types';
import { ROLE_HIERARCHY } from '@pos-yoga/config';

// Get session from request
export async function getSession(req: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: req.headers as any,
  });
  return session;
}

// Require authenticated user
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(req);
  if (!session) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
  (req as any).session = session.session;
  (req as any).user = session.user;
}

// Require minimum role level
export function requireRole(...allowedRoles: Role[]) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await requireAuth(req, reply);
    if (reply.sent) return;

    const user = (req as any).user;
    if (!user || !allowedRoles.includes(user.role)) {
      return reply.status(403).send({ success: false, error: 'Forbidden: insufficient role' });
    }
  };
}

// Require minimum role hierarchy (developer > admin > cashier)
export function requireMinRole(minRole: Role) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await requireAuth(req, reply);
    if (reply.sent) return;

    const user = (req as any).user;
    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return reply.status(403).send({ success: false, error: 'Forbidden: insufficient role level' });
    }
  };
}
