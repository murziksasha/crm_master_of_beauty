import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — Redis features disabled');
      return;
    }
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 3000,
        retryStrategy: () => null,
      });
      this.client.on('error', (err) => {
        this.logger.warn(`Redis error: ${err.message}`);
        this.available = false;
      });
      await this.client.connect();
      const pong = await this.client.ping();
      if (pong !== 'PONG') throw new Error('unexpected ping');
      this.available = true;
      this.logger.log('Redis connected');
    } catch (e) {
      this.available = false;
      this.logger.warn(`Redis unavailable: ${e instanceof Error ? e.message : e}`);
      try {
        this.client?.disconnect(false);
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  isAvailable() {
    return this.available && !!this.client;
  }

  getClient() {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.available) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.available) return false;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.available) return;
    try {
      await this.client.del(key);
    } catch {
      /* ignore */
    }
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.client || !this.available) return 0;
    try {
      const n = await this.client.incr(key);
      if (n === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
      return n;
    } catch {
      return 0;
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client || !this.available) return;
    try {
      await this.client.publish(channel, message);
    } catch {
      /* ignore */
    }
  }
}
