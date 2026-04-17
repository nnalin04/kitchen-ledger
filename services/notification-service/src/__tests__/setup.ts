/**
 * Global test setup for the Notification Service.
 *
 * Sets all required environment variables so config/index.ts validates on import.
 * These are fakes — no real services are contacted during unit tests.
 */
Object.assign(process.env, {
  DATABASE_URL:             'postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test',
  RABBITMQ_URL:             'amqp://guest:guest@localhost:5672',
  RESEND_API_KEY:           'test_resend_key',
  RESEND_FROM_EMAIL:        'noreply@test.com',
  EXPO_ACCESS_TOKEN:        'test_expo_token',
  INTERNAL_SERVICE_SECRET:  'test-internal-secret',
  AUTH_SERVICE_URL:         'http://localhost:8081',
  APP_URL:                  'http://localhost:3000',
  NODE_ENV:                 'test',
});
