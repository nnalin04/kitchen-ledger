import Redis from 'ioredis';
import { config } from './config';

export const redisClient = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redisClient.on('error', err => {
  console.error('[redis] connection error:', err.message);
});
