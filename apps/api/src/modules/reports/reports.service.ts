import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calcStaffCommission,
  parseCommissionTiers,
} from '../../common/utils/commission-tiers';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async overview(from: string, to: string, branchId?: string | null) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const saleWhere: Prisma.SaleWhereInput = {
      paidAt: { gte: fromDate, lte: toDate },
      status: 'PAID',
      ...(branchId ? { branchId } : {}),
    };
    const apptWhere: Prisma.AppointmentWhereInput = {
      startAt: { gte: fromDate, lte: toDate },
      ...(branchId ? { branchId } : {}),
    };

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      include: {
        items: true,
        appointment: { include: { staff: true, services: true } },
      },
    });

    const appointments = await this.prisma.appointment.findMany({
      where: apptWhere,
      include: { staff: true, services: true },
    });

    const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
    const avgCheck = sales.length ? revenue / sales.length : 0;

    const byMethod: Record<string, number> = {};
    for (const s of sales) {
      byMethod[s.method] = (byMethod[s.method] || 0) + Number(s.total);
    }

    const byStaffMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const s of sales) {
      const staffName = s.appointment?.staff?.displayName || 'Без майстра';
      const staffId = s.appointment?.staffId || 'none';
      const cur = byStaffMap.get(staffId) || { name: staffName, revenue: 0, count: 0 };
      cur.revenue += Number(s.total);
      cur.count += 1;
      byStaffMap.set(staffId, cur);
    }

    const byCategoryMap = new Map<string, number>();
    for (const s of sales) {
      for (const item of s.items) {
        if (item.type === 'SERVICE') {
          byCategoryMap.set(item.name, (byCategoryMap.get(item.name) || 0) + Number(item.total));
        }
      }
    }

    const statusCounts: Record<string, number> = {};
    for (const a of appointments) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }

    const cancelled = statusCounts[AppointmentStatus.CANCELLED] || 0;
    const noShow = statusCounts[AppointmentStatus.NO_SHOW] || 0;
    const totalAppt = appointments.length || 1;

    const newClients = await this.prisma.client.count({
      where: { createdAt: { gte: fromDate, lte: toDate }, deletedAt: null },
    });

    const waitlist = await this.prisma.waitlistEntry.count({
      where: {
        ...(branchId ? { branchId } : {}),
        status: { in: ['WAITING', 'NOTIFIED'] },
      },
    });

    return {
      period: { from, to },
      branchId: branchId || null,
      revenue,
      salesCount: sales.length,
      avgCheck: Math.round(avgCheck * 100) / 100,
      byMethod,
      byStaff: Array.from(byStaffMap.values()).sort((a, b) => b.revenue - a.revenue),
      topServices: Array.from(byCategoryMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      appointments: {
        total: appointments.length,
        statusCounts,
        cancelRate: Math.round((cancelled / totalAppt) * 1000) / 10,
        noShowRate: Math.round((noShow / totalAppt) * 1000) / 10,
      },
      newClients,
      waitlistActive: waitlist,
    };
  }

  async exportCsv(from: string, to: string, branchId?: string | null) {
    const sales = await this.prisma.sale.findMany({
      where: {
        paidAt: { gte: new Date(from), lte: new Date(to) },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        client: true,
        cashier: true,
        items: true,
        branch: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    const header = 'Номер;Дата;Філія;Клієнт;Сума;Знижка;Бонуси;Спосіб;Статус;Касир;Позиції';
    const rows = sales.map((s) => {
      const client = s.client
        ? `${s.client.firstName} ${s.client.lastName || ''}`.trim()
        : '—';
      const cashier = `${s.cashier.firstName} ${s.cashier.lastName}`;
      const items = s.items.map((i) => `${i.name} x${i.qty}`).join(' | ');
      return [
        s.number,
        s.paidAt.toISOString(),
        s.branch?.name || '—',
        client,
        Number(s.total).toFixed(2),
        Number(s.discountAmount).toFixed(2),
        Number(s.loyaltyRedeem).toFixed(2),
        s.method,
        s.status,
        cashier,
        items,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';');
    });

    return [header, ...rows].join('\n');
  }

  /** Payroll / commissions by staff for period */
  async commissions(from: string, to: string, branchId?: string | null) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const sales = await this.prisma.sale.findMany({
      where: {
        paidAt: { gte: fromDate, lte: toDate },
        status: 'PAID',
        appointmentId: { not: null },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        items: true,
        appointment: {
          include: {
            staff: true,
            services: true,
          },
        },
      },
    });

    type Row = {
      staffId: string;
      name: string;
      commissionPct: number;
      revenue: number;
      serviceRevenue: number;
      productRevenue: number;
      commission: number;
      salesCount: number;
    };

    const map = new Map<string, Row>();

    for (const sale of sales) {
      const staff = sale.appointment?.staff;
      if (!staff) continue;
      const row =
        map.get(staff.id) ||
        ({
          staffId: staff.id,
          name: staff.displayName,
          commissionPct: staff.commissionPct || 0,
          revenue: 0,
          serviceRevenue: 0,
          productRevenue: 0,
          commission: 0,
          salesCount: 0,
        } satisfies Row);

      let serviceRev = 0;
      let productRev = 0;
      for (const item of sale.items) {
        const t = Number(item.total);
        if (item.type === 'SERVICE') serviceRev += t;
        else productRev += t;
      }
      // if no item split, attribute full total to services
      if (!sale.items.length) serviceRev = Number(sale.total);

      row.serviceRevenue += serviceRev;
      row.productRevenue += productRev;
      row.revenue += Number(sale.total);
      row.salesCount += 1;
      map.set(staff.id, row);
    }

    for (const row of map.values()) {
      const staff = sales.find((s) => s.appointment?.staff?.id === row.staffId)?.appointment
        ?.staff;
      const tiers = parseCommissionTiers(staff?.commissionTiers);
      const calc = calcStaffCommission({
        serviceRevenue: row.serviceRevenue,
        productRevenue: row.productRevenue,
        servicePct: staff?.commissionPct || row.commissionPct || 0,
        productPct: staff?.productCommissionPct ?? 10,
        tiers,
      });
      row.commissionPct = calc.servicePct;
      row.commission = calc.commission;
    }

    const items = Array.from(map.values())
      .map((r) => ({
        ...r,
        revenue: Math.round(r.revenue * 100) / 100,
        serviceRevenue: Math.round(r.serviceRevenue * 100) / 100,
        productRevenue: Math.round(r.productRevenue * 100) / 100,
        commission: Math.round(r.commission * 100) / 100,
      }))
      .sort((a, b) => b.commission - a.commission);

    return {
      period: { from, to },
      branchId: branchId || null,
      totalCommission: Math.round(items.reduce((s, x) => s + x.commission, 0) * 100) / 100,
      totalRevenue: Math.round(items.reduce((s, x) => s + x.revenue, 0) * 100) / 100,
      items,
    };
  }

  /** Birthdays today / this week for CRM win-back */
  async birthdays(days = 7) {
    const now = new Date();
    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null, isActive: true, birthDate: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        birthDate: true,
        loyalty: true,
      },
      take: 500,
    });
    const upcoming: {
      id: string;
      firstName: string;
      lastName: string | null;
      phone: string;
      email: string | null;
      birthDate: Date;
      daysUntil: number;
      points: number;
    }[] = [];
    for (const c of clients) {
      if (!c.birthDate) continue;
      const b = new Date(c.birthDate);
      const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next.setFullYear(next.getFullYear() + 1);
      }
      const daysUntil = Math.round(
        (next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
          86_400_000,
      );
      if (daysUntil <= days) {
        upcoming.push({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          birthDate: c.birthDate,
          daysUntil,
          points: Number(c.loyalty?.pointsBalance || 0),
        });
      }
    }
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    return { days, count: upcoming.length, items: upcoming };
  }

  /** Single staff earnings (MASTER self-view) */
  async myCommissions(staffId: string, from: string, to: string) {
    const all = await this.commissions(from, to, null);
    const mine = all.items.find((i) => i.staffId === staffId);
    return {
      period: { from, to },
      staffId,
      item: mine || {
        staffId,
        name: '—',
        commissionPct: 0,
        revenue: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        commission: 0,
        salesCount: 0,
      },
    };
  }

  /** Payroll CSV for bank / accountant */
  async exportCommissionsCsv(from: string, to: string, branchId?: string | null) {
    const data = await this.commissions(from, to, branchId);
    const header =
      'Майстер;Комісія %;Виручка послуг;Виручка товарів;Виручка всього;Чеків;До виплати ₴';
    const rows = data.items.map((r) =>
      [
        r.name,
        r.commissionPct,
        r.serviceRevenue.toFixed(2),
        r.productRevenue.toFixed(2),
        r.revenue.toFixed(2),
        r.salesCount,
        r.commission.toFixed(2),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';'),
    );
    const total = `"РАЗОМ";"";"";"";${data.totalRevenue.toFixed(2)};"";${data.totalCommission.toFixed(2)}`;
    return ['\uFEFF' + header, ...rows, total].join('\n');
  }

  /** Clients without visits for N days (win-back segment) */
  async inactiveClients(days = 60, branchId?: string | null) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const clients = await this.prisma.client.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        appointments: {
          some: branchId ? { branchId } : {},
          none: {
            startAt: { gte: since },
            status: { notIn: ['CANCELLED'] },
          },
        },
      },
      include: {
        loyalty: true,
        appointments: {
          orderBy: { startAt: 'desc' },
          take: 1,
          include: { services: true, staff: { select: { displayName: true } } },
        },
      },
      take: 100,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      days,
      count: clients.length,
      items: clients.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        loyalty: c.loyalty,
        lastVisit: c.appointments[0] || null,
      })),
    };
  }
}
