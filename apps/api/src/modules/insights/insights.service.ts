import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { subDays } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Lightweight analytics / AI-assist helpers (rule-based, no external LLM required).
 */
@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  async revenueBrief(branchId?: string | null) {
    const now = new Date();
    const thisStart = subDays(now, 7);
    const prevStart = subDays(now, 14);

    const [thisWeek, prevWeek, noShows, products, waitlist] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: thisStart, lte: now },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: prevStart, lt: thisStart },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.NO_SHOW,
          startAt: { gte: thisStart },
          ...(branchId ? { branchId } : {}),
        },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, deletedAt: null, ...(branchId ? { branchId } : {}) },
        select: { stockQty: true, minStock: true },
      }),
      this.prisma.waitlistEntry.count({
        where: {
          status: { in: ['WAITING', 'NOTIFIED'] },
          ...(branchId ? { branchId } : {}),
        },
      }),
    ]);
    const lowStock = products.filter((p) => Number(p.stockQty) <= Number(p.minStock)).length;

    const cur = Number(thisWeek._sum.total || 0);
    const prev = Number(prevWeek._sum.total || 0);
    const deltaPct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

    const reasons: string[] = [];
    if (deltaPct !== null && deltaPct < -10) {
      reasons.push(`Виручка за 7 днів нижча за попередній тиждень на ${Math.abs(deltaPct)}%.`);
    } else if (deltaPct !== null && deltaPct > 10) {
      reasons.push(`Виручка за 7 днів вища за попередній тиждень на ${deltaPct}%.`);
    } else {
      reasons.push('Виручка за тиждень стабільна порівняно з попереднім.');
    }
    if (noShows > 0) {
      reasons.push(`Неявок за тиждень: ${noShows}. Рекомендуємо нагадування −2 год і депозит.`);
    }
    if (waitlist > 0) {
      reasons.push(`У листі очікування ${waitlist} клієнтів — можна заповнити скасування.`);
    }
    if (typeof lowStock === 'number' && lowStock > 0) {
      reasons.push(`Товарів з низьким залишком: ${lowStock}.`);
    }

    return {
      thisWeekRevenue: cur,
      prevWeekRevenue: prev,
      deltaPct,
      thisWeekSales: thisWeek._count,
      prevWeekSales: prevWeek._count,
      noShows,
      waitlist,
      lowStock,
      summaryUk: reasons.join(' '),
      bullets: reasons,
    };
  }
}
