import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(8086),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().default('noreply@kitchenledger.app'),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  INTERNAL_SERVICE_SECRET: z.string().min(1),
  AUTH_SERVICE_URL: z.string().url().default('http://auth-service:8081'),
  APP_URL: z.string().default('https://app.kitchenledger.com'),
});

const result = configSchema.safeParse(process.env);
if (!result.success) {
  console.error('Missing or invalid environment variables:\n', result.error.format());
  process.exit(1);
}

export const config = result.data;
