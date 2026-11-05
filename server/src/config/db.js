import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/retry.js';

mongoose.set('strictQuery', true);

export async function connectDB({ retries = 5 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
      logger.info('MongoDB connected', { host: mongoose.connection.host, db: mongoose.connection.name });
      return mongoose.connection;
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(10000, 1000 * 2 ** (attempt - 1));
      logger.warn('MongoDB connection failed, retrying', { attempt, delayMs: delay, error: err.message });
      await sleep(delay);
    }
  }
}

export const dbState = () => ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';

export async function disconnectDB() {
  await mongoose.disconnect();
}
