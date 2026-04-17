import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redisClient } from '../redis';

// A route entry can be either a plain path string (any HTTP method is allowed)
// or an object restricting which methods bypass JWT verification.
type PublicRoute = string | { path: string; methods: string[] };

const PUBLIC_ROUTES: PublicRoute[] = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  // Accept-invite is POST only: GET/PUT/etc. still require a valid JWT.
  { path: '/api/auth/users/accept-invite', methods: ['POST'] },
  '/health',
];

export interface JWTPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
  exp: number;
  iat: number;
  jti: string;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path   = request.url.split('?')[0];
  const method = (request.method ?? 'GET').toUpperCase();

  const isPublic = PUBLIC_ROUTES.some(r =>
    typeof r === 'string'
      ? path.startsWith(r)
      : path.startsWith(r.path) && r.methods.includes(method)
  );
  if (isPublic) return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Authorization header required' },
    });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, config.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JWTPayload;

    const isRevoked = await redisClient.get(`revoked:${payload.jti}`);
    if (isRevoked !== null) {
      return reply.code(401).send({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' },
      });
    }

    // Forward identity context to downstream services
    request.headers['x-user-id'] = payload.sub;
    request.headers['x-tenant-id'] = payload.tenant_id;
    request.headers['x-user-role'] = payload.role;
    request.headers['x-user-email'] = payload.email;

  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return reply.code(401).send({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
      });
    }
    return reply.code(401).send({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }
}
