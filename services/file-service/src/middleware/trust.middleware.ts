import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

export const ATTR_USER_ID = 'userId';
export const ATTR_TENANT_ID = 'tenantId';
export const ATTR_USER_ROLE = 'userRole';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    tenantId: string;
    userRole: string;
  }
}

/**
 * Reads gateway-injected headers and attaches them to the request.
 * Must be registered on routes that require authentication.
 */
export function gatewayTrustMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  const userRole = req.headers['x-user-role'] as string | undefined;

  if (!userId || !tenantId || !userRole) {
    reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing gateway auth headers' },
    });
    return;
  }

  req.userId = userId;
  req.tenantId = tenantId;
  req.userRole = userRole;
  done();
}
