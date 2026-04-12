import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(8085),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default('kitchenledger-files'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  INTERNAL_SERVICE_SECRET: z.string().min(1),
});

const result = configSchema.safeParse(process.env);
if (!result.success) {
  console.error('Missing or invalid environment variables:\n', result.error.format());
  process.exit(1);
}

export const config = result.data;
