import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export type RealtimeEvent = {
  type: string;
  entity?: string;
  id?: string;
  branchId?: string | null;
  payload?: Record<string, unknown>;
  at: string;
};

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly local$ = new Subject<RealtimeEvent>();
  private sub: Redis | null = null;
  private readonly channel = 'mob:events';

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!url) return;
    try {
      this.sub = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 3000,
        retryStrategy: () => null,
      });
      await this.sub.connect();
      await this.sub.subscribe(this.channel);
      this.sub.on('message', (_ch, message) => {
        try {
          const event = JSON.parse(message) as RealtimeEvent;
          this.local$.next(event);
        } catch {
          /* ignore bad payload */
        }
      });
      this.logger.log('Realtime Redis subscriber ready');
    } catch (e) {
      this.logger.warn(`Realtime Redis sub unavailable: ${e instanceof Error ? e.message : e}`);
      try {
        this.sub?.disconnect(false);
      } catch {
        /* ignore */
      }
      this.sub = null;
    }
  }

  async onModuleDestroy() {
    try {
      await this.sub?.quit();
    } catch {
      /* ignore */
    }
  }

  publish(event: Omit<RealtimeEvent, 'at'>) {
    const full: RealtimeEvent = { ...event, at: new Date().toISOString() };
    this.local$.next(full);
    const url = this.config.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!url) return;
    // fire-and-forget publish via short-lived connection would be heavy;
    // use existing sub connection's duplicate if possible
    void this.publishRedis(full);
  }

  private async publishRedis(event: RealtimeEvent) {
    try {
      if (!this.sub) return;
      // ioredis subscriber connection cannot publish — use duplicate
      const pub = this.sub.duplicate();
      await pub.publish(this.channel, JSON.stringify(event));
      pub.disconnect();
    } catch {
      /* ignore */
    }
  }

  stream(branchId?: string | null): Observable<{ data: RealtimeEvent }> {
    return this.local$.asObservable().pipe(
      filter((e) => !branchId || !e.branchId || e.branchId === branchId),
      map((e) => ({ data: e })),
    );
  }
}
