import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus } from '@prisma/client';
import { addHours, subHours, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const TZ = process.env.SALON_TZ || 'Europe/Kyiv';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private running = false;
  private dailyRunning = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processAppointmentReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const in25h = addHours(now, 25);
      const in23h = addHours(now, 23);
      const in3h = addHours(now, 3);
      const in1h = addHours(now, 1);

      const for24h = await this.prisma.appointment.findMany({
        where: {
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          reminder24hSentAt: null,
          startAt: { gte: in23h, lte: in25h },
        },
        include: {
          client: true,
          staff: true,
          services: true,
        },
        take: 50,
      });

      for (const appt of for24h) {
        const when = appt.startAt.toLocaleString('uk-UA', { timeZone: TZ });
        const body =
          `${appt.client.firstName}, нагадування: завтра у вас запис Master of Beauty ` +
          `на ${when}, майстер ${appt.staff.displayName}.`;
        await this.notifications.send({
          channel: 'sms',
          to: appt.client.phone,
          body,
          meta: { type: 'reminder_24h', appointmentId: appt.id },
        });
        if (appt.client.email) {
          await this.notifications.send({
            channel: 'email',
            to: appt.client.email,
            subject: 'Нагадування про запис — Master of Beauty',
            body,
            meta: { type: 'reminder_24h', appointmentId: appt.id },
          });
        }
        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { reminder24hSentAt: now },
        });
      }

      const for2h = await this.prisma.appointment.findMany({
        where: {
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          reminder2hSentAt: null,
          startAt: { gte: in1h, lte: in3h },
        },
        include: {
          client: true,
          staff: true,
          services: true,
        },
        take: 50,
      });

      for (const appt of for2h) {
        const when = appt.startAt.toLocaleString('uk-UA', { timeZone: TZ });
        const body =
          `${appt.client.firstName}, через ~2 год у вас запис Master of Beauty ` +
          `(${when}), майстер ${appt.staff.displayName}. Чекаємо!`;
        await this.notifications.send({
          channel: 'sms',
          to: appt.client.phone,
          body,
          meta: { type: 'reminder_2h', appointmentId: appt.id },
        });
        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { reminder2hSentAt: now },
        });
      }

      if (for24h.length || for2h.length) {
        this.logger.log(`Reminders sent: 24h=${for24h.length}, 2h=${for2h.length}`);
      }

      const dayAgo = subHours(now, 24);
      await this.prisma.waitlistEntry.updateMany({
        where: {
          status: { in: ['WAITING', 'NOTIFIED'] },
          preferredDate: { lt: dayAgo },
        },
        data: { status: 'EXPIRED' },
      });
    } catch (e) {
      this.logger.error(`Reminder job failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /** 08:05 Kyiv — staff day digests, birthdays, low-stock alert */
  @Cron('5 8 * * *', { timeZone: 'Europe/Kyiv' })
  async dailyOpsDigest() {
    if (this.dailyRunning) return;
    this.dailyRunning = true;
    try {
      await Promise.all([
        this.sendStaffMorningDigests(),
        this.sendBirthdayGreetings(),
        this.sendLowStockAlert(),
      ]);
    } catch (e) {
      this.logger.error(`Daily ops job failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.dailyRunning = false;
    }
  }

  async sendStaffMorningDigests() {
    const now = toZonedTime(new Date(), TZ);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const appts = await this.prisma.appointment.findMany({
      where: {
        startAt: { gte: dayStart, lte: dayEnd },
        status: {
          in: [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
          ],
        },
      },
      include: {
        client: true,
        staff: { include: { user: true } },
        services: true,
      },
      orderBy: { startAt: 'asc' },
    });

    const byStaff = new Map<string, typeof appts>();
    for (const a of appts) {
      const list = byStaff.get(a.staffId) || [];
      list.push(a);
      byStaff.set(a.staffId, list);
    }

    let sent = 0;
    for (const [, list] of byStaff) {
      const staff = list[0].staff;
      const phone = staff.user?.phone;
      const email = staff.user?.email;
      if (!phone && !email) continue;

      const lines = list.map((a) => {
        const t = a.startAt.toLocaleTimeString('uk-UA', {
          timeZone: TZ,
          hour: '2-digit',
          minute: '2-digit',
        });
        const svc = a.services.map((s) => s.nameSnapshot).join(', ');
        return `${t} · ${a.client.firstName} ${a.client.lastName || ''} · ${svc}`;
      });
      const body =
        `Доброго ранку, ${staff.displayName}! Сьогодні ${list.length} записів:\n` +
        lines.join('\n');

      if (phone) {
        await this.notifications.send({
          channel: 'sms',
          to: phone,
          body: body.slice(0, 600),
          meta: { type: 'staff_morning_digest', staffId: staff.id },
        });
      }
      if (email) {
        await this.notifications.send({
          channel: 'email',
          to: email,
          subject: `Розклад на ${format(now, 'dd.MM.yyyy')} — Master of Beauty`,
          body,
          meta: { type: 'staff_morning_digest', staffId: staff.id },
        });
      }
      sent += 1;
    }
    this.logger.log(`Staff morning digests: ${sent}`);
    return { sent };
  }

  async sendBirthdayGreetings() {
    const now = toZonedTime(new Date(), TZ);
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // Postgres extract month/day via raw for efficiency
    const clients = await this.prisma.$queryRaw<
      { id: string; firstName: string; phone: string; email: string | null }[]
    >`
      SELECT id, "firstName", phone, email FROM "Client"
      WHERE "deletedAt" IS NULL AND "isActive" = true AND "birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthDate") = ${month}
        AND EXTRACT(DAY FROM "birthDate") = ${day}
      LIMIT 100
    `;

    for (const c of clients) {
      const body =
        `${c.firstName}, вітаємо з Днем народження від Master of Beauty! ` +
        `З любовʼю чекаємо вас у салоні 💖`;
      if (c.phone) {
        await this.notifications.send({
          channel: 'sms',
          to: c.phone,
          body,
          meta: { type: 'birthday', clientId: c.id },
        });
      }
      if (c.email) {
        await this.notifications.send({
          channel: 'email',
          to: c.email,
          subject: 'З Днем народження! — Master of Beauty',
          body,
          meta: { type: 'birthday', clientId: c.id },
        });
      }
    }
    this.logger.log(`Birthday greetings: ${clients.length}`);
    return { count: clients.length };
  }

  async sendLowStockAlert() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { name: true, stockQty: true, minStock: true, unit: true },
    });
    const low = products.filter((p) => Number(p.stockQty) <= Number(p.minStock));
    if (!low.length) return { count: 0 };

    const salon = await this.prisma.salon.findFirst();
    const owners = await this.prisma.user.findMany({
      where: { role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
      take: 5,
    });

    const lines = low
      .slice(0, 30)
      .map((p) => `• ${p.name}: ${Number(p.stockQty)} ${p.unit} (мін. ${Number(p.minStock)})`)
      .join('\n');
    const body = `Low-stock alert (${low.length} позицій):\n${lines}`;

    const targets = new Set<string>();
    if (salon?.email) targets.add(salon.email);
    for (const u of owners) if (u.email) targets.add(u.email);
    if (salon?.phone) {
      await this.notifications.send({
        channel: 'sms',
        to: salon.phone,
        body: `Склад: ${low.length} товарів на мінімумі. Перевірте CRM.`,
        meta: { type: 'low_stock', count: low.length },
      });
    }
    for (const email of targets) {
      await this.notifications.send({
        channel: 'email',
        to: email,
        subject: `Низький залишок — ${low.length} товарів`,
        body,
        meta: { type: 'low_stock', count: low.length },
      });
    }
    this.logger.log(`Low-stock alerts: ${low.length} products, ${targets.size} emails`);
    return { count: low.length };
  }
}
