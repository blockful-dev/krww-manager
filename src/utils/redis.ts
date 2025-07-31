import { createClient } from 'redis';
import { config } from '../config';
import { logger } from './logger';

export class RedisManager {
  private static instance: RedisManager;
  private client: ReturnType<typeof createClient>;

  private constructor() {
    this.client = createClient({
      url: config.redis.url
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis Client Disconnected');
    });
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  public getClient(): ReturnType<typeof createClient> {
    return this.client;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }
}