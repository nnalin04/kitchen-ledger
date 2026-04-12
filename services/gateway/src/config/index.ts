import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Upstream service URLs
  AUTH_SERVICE_URL: z.string().url(),
  INVENTORY_SERVICE_URL: z.string().url(),
  FINANCE_SERVICE_URL: z.string().url(),
  STAFF_SERVICE_URL: z.string().url(),
  AI_SERVICE_URL: z.string().url(),
  FILE_SERVICE_URL: z.string().url(),
  NOTIFICATION_SERVICE_URL: z.string().url(),
  REPORT_SERVICE_URL: z.string().url(),

  // JWT public key for RS256 verification (PEM string with \n)
  JWT_PUBLIC_KEY: z.string().min(1),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Internal secret for service-to-service calls
  INTERNAL_SERVICE_SECRET: z.string().min(1),
});

const result = configSchema.safeParse(process.env);
if (!result.success) {
  console.error('Missing or invalid environment variables:\n', result.error.format());
  process.exit(1);
}

export const config = result.data;
