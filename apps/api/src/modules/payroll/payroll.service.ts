import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayrollPeriodStatus } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';

export class ClosePayrollDto {
  @IsString() from!: string;
  @IsString() to!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
    private audit: AuditService,
  ) {}

  list(limit = 20) {
    return this.prisma.payrollPeriod.findMany({
      orderBy: { closedAt: 'desc' },
      take: limit,
      include: {
        lines: { orderBy: { commission: 'desc' } },
        closedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async get(id: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { commission: 'desc' } },
        closedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!period) throw new NotFoundException('Період не знайдено');
    return period;
  }

  async close(dto: ClosePayrollDto, userId: string) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('Некоректний період');
    }

    // Prevent exact duplicate period closes
    const existing = await this.prisma.payrollPeriod.findFirst({
      where: {
        fromDate: from,
        toDate: to,
        branchId: dto.branchId || null,
        status: { in: [PayrollPeriodStatus.CLOSED, PayrollPeriodStatus.PAID] },
      },
    });
    if (existing) {
      throw new BadRequestException('Цей період уже закрито. Відкрийте існуючий запис.');
    }

    const calc = await this.reports.commissions(dto.from, dto.to, dto.branchId);
    if (!calc.items.length) {
      throw new BadRequestException('Немає комісій за період — нічого закривати');
    }

    const period = await this.prisma.payrollPeriod.create({
      data: {
        branchId: dto.branchId || undefined,
        fromDate: from,
        toDate: to,
        status: PayrollPeriodStatus.CLOSED,
        totalAmount: calc.totalCommission,
        note: dto.note,
        closedById: userId,
        lines: {
          create: calc.items.map((i) => ({
            staffId: i.staffId,
            staffName: i.name,
            commissionPct: i.commissionPct,
            serviceRevenue: i.serviceRevenue,
            productRevenue: i.productRevenue,
            revenue: i.revenue,
            salesCount: i.salesCount,
            commission: i.commission,
          })),
        },
      },
      include: { lines: true },
    });

    void this.audit.log({
      userId,
      action: 'OTHER',
      entity: 'PayrollPeriod',
      entityId: period.id,
      summary: `Закрито ЗП період ${from.toISOString().slice(0, 10)}–${to.toISOString().slice(0, 10)} · ${calc.totalCommission} ₴`,
      meta: { total: calc.totalCommission, staffCount: calc.items.length },
    });

    return period;
  }

  async exportCsv(id: string) {
    const period = await this.get(id);
    const header =
      'Період з;Період по;Майстер;Комісія %;Виручка послуг;Виручка товарів;Виручка;Чеків;До виплати;Виплачено';
    const from = period.fromDate.toISOString().slice(0, 10);
    const to = period.toDate.toISOString().slice(0, 10);
    const rows = period.lines.map((l) =>
      [
        from,
        to,
        l.staffName,
        l.commissionPct,
        Number(l.serviceRevenue).toFixed(2),
        Number(l.productRevenue).toFixed(2),
        Number(l.revenue).toFixed(2),
        l.salesCount,
        Number(l.commission).toFixed(2),
        l.paidAt ? l.paidAt.toISOString() : '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';'),
    );
    const total = `"${from}";"${to}";"РАЗОМ";"";"";"";"";"";"${Number(period.totalAmount).toFixed(2)}";"${period.status}"`;
    return ['\uFEFF' + header, ...rows, total].join('\n');
  }

  async markPaid(id: string) {
    const period = await this.get(id);
    if (period.status === PayrollPeriodStatus.PAID) return period;
    await this.prisma.payrollLine.updateMany({
      where: { periodId: id, paidAt: null },
      data: { paidAt: new Date() },
    });
    return this.prisma.payrollPeriod.update({
      where: { id },
      data: { status: PayrollPeriodStatus.PAID },
      include: { lines: true },
    });
  }

  /** Reopen = delete CLOSED period so it can be closed again with fresh numbers */
  async reopen(id: string) {
    const period = await this.get(id);
    if (period.status === PayrollPeriodStatus.PAID) {
      throw new BadRequestException(
        'Спочатку зніміть позначку «виплачено» (unmark-paid), потім reopen.',
      );
    }
    await this.prisma.payrollPeriod.delete({ where: { id } });
    return { ok: true, deletedId: id };
  }

  /** Reverse PAID → CLOSED (before reopen) */
  async unmarkPaid(id: string) {
    const period = await this.get(id);
    if (period.status !== PayrollPeriodStatus.PAID) {
      throw new BadRequestException('Період не в статусі PAID');
    }
    await this.prisma.payrollLine.updateMany({
      where: { periodId: id },
      data: { paidAt: null },
    });
    return this.prisma.payrollPeriod.update({
      where: { id },
      data: { status: PayrollPeriodStatus.CLOSED },
      include: { lines: true },
    });
  }
}
