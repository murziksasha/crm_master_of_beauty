import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string | null;
    action: AuditAction | keyof typeof AuditAction;
    entity: string;
    entityId?: string | null;
    summary: string;
    meta?: Record<string, unknown>;
    ip?: string | null;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId || undefined,
          action: params.action as AuditAction,
          entity: params.entity,
          entityId: params.entityId || undefined,
          summary: params.summary,
          meta: (params.meta as Prisma.InputJsonValue) || undefined,
          ip: params.ip || undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit log failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async list(query: { entity?: string; entityId?: string; limit?: number }) {
    const limit = Math.min(query.limit || 50, 200);
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
