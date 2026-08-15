import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(branchId?: string | null, staffId?: string | null) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const isMaster = !!staffId;

    const apptWhere: Prisma.AppointmentWhereInput = {
      startAt: { gte: start, lte: end },
      status: { not: AppointmentStatus.CANCELLED },
      ...(branchId ? { branchId } : {}),
      ...(staffId ? { staffId } : {}),
    };
    const saleWhere: Prisma.SaleWhereInput = {
      paidAt: { gte: start, lte: end },
      ...(branchId ? { branchId } : {}),
      ...(staffId
        ? { appointment: { staffId } }
        : {}),
    };
    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(branchId ? { branchId } : {}),
    };

    const [appointmentsToday, salesToday, newClients, lowStockCount, upcoming, waitlistCount, branch] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: apptWhere,
          include: {
            client: true,
            staff: { select: { displayName: true, color: true } },
            services: true,
          },
          orderBy: { startAt: 'asc' },
        }),
        isMaster
          ? Promise.resolve([])
          : this.prisma.sale.findMany({ where: saleWhere }),
        isMaster
          ? Promise.resolve(0)
          : this.prisma.client.count({
              where: { createdAt: { gte: start, lte: end }, deletedAt: null },
            }),
        isMaster
          ? Promise.resolve(0)
          : this.prisma.product
              .findMany({
                where: productWhere,
                select: { stockQty: true, minStock: true },
              })
              .then((products) =>
                products.filter((p) => Number(p.stockQty) <= Number(p.minStock)).length,
              ),
        this.prisma.appointment.findMany({
          where: {
            startAt: { gte: new Date() },
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            ...(branchId ? { branchId } : {}),
            ...(staffId ? { staffId } : {}),
          },
          include: {
            client: true,
            staff: { select: { displayName: true, color: true } },
            services: true,
          },
          orderBy: { startAt: 'asc' },
          take: 8,
        }),
        isMaster
          ? Promise.resolve(0)
          : this.prisma.waitlistEntry.count({
              where: {
                ...(branchId ? { branchId } : {}),
                status: { in: ['WAITING', 'NOTIFIED'] },
              },
            }),
        branchId
          ? this.prisma.branch.findUnique({ where: { id: branchId } })
          : Promise.resolve(null),
      ]);

    const revenue = salesToday.reduce((s, x) => s + Number(x.total), 0);
    const pending = appointmentsToday.filter((a) => a.status === AppointmentStatus.PENDING).length;
    const completed = appointmentsToday.filter((a) => a.status === AppointmentStatus.COMPLETED).length;
    const inProgress = appointmentsToday.filter(
      (a) => a.status === AppointmentStatus.IN_PROGRESS,
    ).length;
    const noShow = appointmentsToday.filter((a) => a.status === AppointmentStatus.NO_SHOW).length;

    // Master: estimate today's commission from completed paid sales
    let masterEarningsToday = 0;
    let masterCommissionPct = 0;
    if (isMaster && staffId) {
      const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffId } });
      masterCommissionPct = staff?.commissionPct || 0;
      const paidSales = await this.prisma.sale.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: start, lte: end },
          appointment: { staffId },
        },
        include: { items: true },
      });
      for (const sale of paidSales) {
        const serviceRev = sale.items
          .filter((i) => i.type === 'SERVICE')
          .reduce((s, i) => s + Number(i.total), 0);
        masterEarningsToday += (serviceRev * masterCommissionPct) / 100;
      }
      masterEarningsToday = Math.round(masterEarningsToday * 100) / 100;
    }

    return {
      branch: branch ? { id: branch.id, name: branch.name } : null,
      mode: isMaster ? 'master' : 'full',
      kpis: {
        appointmentsToday: appointmentsToday.length,
        revenueToday: revenue,
        newClients,
        lowStock: lowStockCount,
        pendingOnline: pending,
        completedToday: completed,
        inProgressToday: inProgress,
        noShowToday: noShow,
        waitlist: waitlistCount,
        masterEarningsToday,
        masterCommissionPct,
      },
      appointmentsToday,
      upcoming,
    };
  }
}
