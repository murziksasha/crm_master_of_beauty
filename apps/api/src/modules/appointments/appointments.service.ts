import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { AppointmentSource, AppointmentStatus, Prisma } from '@prisma/client';
import { addMinutes, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PaymentsService } from '../payments/payments.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import {
  AppointmentQueryDto,
  CreateAppointmentDto,
  SlotsQueryDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

const TZ = process.env.SALON_TZ || 'Europe/Kyiv';
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private redis: RedisService,
    private audit: AuditService,
    private realtime: RealtimeService,
    private payments: PaymentsService,
    @Optional()
    @Inject(forwardRef(() => WaitlistService))
    private waitlist?: WaitlistService,
  ) {}

  async changes(since?: string, branchId?: string | null) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 60_000);
    return this.prisma.appointment.findMany({
      where: {
        updatedAt: { gt: sinceDate },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        staffId: true,
        clientId: true,
        branchId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
  }

  async findAll(query: AppointmentQueryDto) {
    const where: Prisma.AppointmentWhereInput = {};
    if (query.from || query.to) {
      where.startAt = {};
      if (query.from) where.startAt.gte = new Date(query.from);
      if (query.to) where.startAt.lte = new Date(query.to);
    }
    if (query.staffId) where.staffId = query.staffId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.status) where.status = query.status;

    return this.prisma.appointment.findMany({
      where,
      include: {
        client: true,
        staff: { select: { id: true, displayName: true, color: true } },
        services: true,
        room: { select: { id: true, name: true, color: true } },
        sale: { select: { id: true, total: true, number: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  // roomId is a scalar on Appointment — included in list results automatically

  async findOne(id: string) {
    const item = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        client: { include: { loyalty: true } },
        staff: true,
        services: { include: { service: true } },
        sale: { include: { items: true } },
      },
    });
    if (!item) throw new NotFoundException('Запис не знайдено');
    return item;
  }

  async create(dto: CreateAppointmentDto, actorUserId?: string) {
    const services = await this.loadServices(dto.serviceIds);
    const duration = services.reduce((s, x) => s + x.durationMin + x.bufferMin, 0);
    const startAt = new Date(dto.startAt);
    const endAt = addMinutes(startAt, duration);

    const staff = await this.prisma.staffProfile.findUnique({ where: { id: dto.staffId } });
    const branchId = dto.branchId || staff?.branchId || undefined;

    const appointment = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffSchedule(tx, dto.staffId);
      await this.assertNoConflictTx(tx, dto.staffId, startAt, endAt);
      if (dto.roomId) {
        await this.assertRoomFreeTx(tx, dto.roomId, startAt, endAt);
      }

      return tx.appointment.create({
        data: {
          clientId: dto.clientId,
          staffId: dto.staffId,
          branchId,
          roomId: dto.roomId,
          seriesId: dto.seriesId,
          startAt,
          endAt,
          status: dto.status || AppointmentStatus.CONFIRMED,
          source: dto.source || AppointmentSource.ADMIN,
          notes: dto.notes,
          services: {
            create: services.map((s, i) => ({
              serviceId: s.id,
              nameSnapshot: s.name,
              priceSnapshot: s.price,
              durationSnapshot: s.durationMin,
              sortOrder: i,
            })),
          },
        },
        include: {
          client: true,
          staff: true,
          services: true,
          room: true,
        },
      });
    });

    void this.notifications.appointmentCreated({
      clientPhone: appointment.client.phone,
      clientName: `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim(),
      clientEmail: appointment.client.email,
      staffName: appointment.staff.displayName,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      services: appointment.services.map((s) => s.nameSnapshot),
      status: appointment.status,
      source: appointment.source,
      appointmentId: appointment.id,
      location: appointment.room?.name || undefined,
    });

    void this.audit.log({
      userId: actorUserId,
      action: 'CREATE',
      entity: 'Appointment',
      entityId: appointment.id,
      summary: `Створено запис ${appointment.startAt.toISOString()}`,
    });

    void this.redis.publish(
      'appointments',
      JSON.stringify({ type: 'created', id: appointment.id, branchId: appointment.branchId }),
    );
    this.realtime.publish({
      type: 'appointment.created',
      entity: 'Appointment',
      id: appointment.id,
      branchId: appointment.branchId,
      payload: {
        staffId: appointment.staffId,
        startAt: appointment.startAt.toISOString(),
        clientName: `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim(),
        staffName: appointment.staff.displayName,
        message: `Новий запис: ${appointment.client.firstName} · ${appointment.staff.displayName}`,
      },
    });

    return appointment;
  }

  async reschedule(
    id: string,
    dto: { startAt?: string; endAt?: string; staffId?: string; roomId?: string | null; durationMin?: number },
    actorUserId?: string,
  ) {
    const existing = await this.findOne(id);
    if (
      existing.status === AppointmentStatus.CANCELLED ||
      existing.status === AppointmentStatus.COMPLETED
    ) {
      throw new BadRequestException('Не можна перенести завершений або скасований запис');
    }
    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    let endAt: Date;
    if (dto.endAt) {
      endAt = new Date(dto.endAt);
    } else if (dto.durationMin) {
      endAt = addMinutes(startAt, Math.max(15, Math.round(dto.durationMin)));
    } else {
      const durationMin = Math.max(
        5,
        Math.round((existing.endAt.getTime() - existing.startAt.getTime()) / 60000),
      );
      endAt = addMinutes(startAt, durationMin);
    }
    if (endAt <= startAt) {
      throw new BadRequestException('Кінець має бути пізніше за початок');
    }
    const staffId = dto.staffId || existing.staffId;
    const roomId =
      dto.roomId !== undefined ? dto.roomId || null : existing.roomId;

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockStaffSchedule(tx, staffId);
      await this.assertNoConflictTx(tx, staffId, startAt, endAt, id);
      if (roomId) {
        await this.assertRoomFreeTx(tx, roomId, startAt, endAt, id);
      }
      return tx.appointment.update({
        where: { id },
        data: { startAt, endAt, staffId, roomId: roomId || null },
        include: {
          client: true,
          staff: true,
          services: true,
          sale: true,
          room: true,
        },
      });
    });

    void this.audit.log({
      userId: actorUserId,
      action: 'UPDATE',
      entity: 'Appointment',
      entityId: id,
      summary: `Перенесено/змінено тривалість ${startAt.toISOString()}–${endAt.toISOString()}`,
    });
    this.realtime.publish({
      type: 'appointment.rescheduled',
      entity: 'Appointment',
      id,
      branchId: updated.branchId,
      payload: {
        staffId: updated.staffId,
        startAt: updated.startAt.toISOString(),
        endAt: updated.endAt.toISOString(),
        roomId: updated.roomId,
        message: `Перенесено: ${updated.client.firstName} → ${updated.startAt.toLocaleString('uk-UA')}`,
      },
    });
    return updated;
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const existing = await this.findOne(id);
    let startAt = existing.startAt;
    let endAt = existing.endAt;
    let staffId = dto.staffId || existing.staffId;

    let serviceCreates:
      | {
          serviceId: string;
          nameSnapshot: string;
          priceSnapshot: Prisma.Decimal;
          durationSnapshot: number;
          sortOrder: number;
        }[]
      | undefined;

    if (dto.serviceIds?.length || dto.startAt) {
      const services = dto.serviceIds?.length
        ? await this.loadServices(dto.serviceIds)
        : existing.services.map((s) => ({
            id: s.serviceId,
            name: s.nameSnapshot,
            price: s.priceSnapshot,
            durationMin: s.durationSnapshot,
            bufferMin: 0,
          }));
      const duration = services.reduce(
        (sum, s) => sum + s.durationMin + ('bufferMin' in s ? (s as { bufferMin: number }).bufferMin : 0),
        0,
      );
      startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
      endAt = addMinutes(startAt, duration || Math.max(1, (existing.endAt.getTime() - existing.startAt.getTime()) / 60000));
      if (dto.serviceIds?.length) {
        serviceCreates = services.map((s, i) => ({
          serviceId: s.id,
          nameSnapshot: s.name,
          priceSnapshot: s.price as Prisma.Decimal,
          durationSnapshot: s.durationMin,
          sortOrder: i,
        }));
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockStaffSchedule(tx, staffId);
      await this.assertNoConflictTx(tx, staffId, startAt, endAt, id);

      if (serviceCreates) {
        await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
        await tx.appointmentService.createMany({
          data: serviceCreates.map((s) => ({ ...s, appointmentId: id })),
        });
      }
      return tx.appointment.update({
        where: { id },
        data: {
          clientId: dto.clientId,
          staffId,
          startAt,
          endAt,
          status: dto.status,
          notes: dto.notes,
        },
        include: { client: true, staff: true, services: true },
      });
    });
  }

  async updateStatus(id: string, status: AppointmentStatus, actorUserId?: string) {
    const existing = await this.findOne(id);
    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        checkedInAt:
          status === AppointmentStatus.IN_PROGRESS && !existing.checkedInAt
            ? new Date()
            : undefined,
      },
      include: { client: true, staff: true, services: true },
    });

    if (existing.status !== status) {
      void this.notifications.appointmentStatusChanged({
        clientPhone: appointment.client.phone,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim(),
        status: appointment.status,
        startAt: appointment.startAt,
      });
      void this.audit.log({
        userId: actorUserId,
        action: 'STATUS',
        entity: 'Appointment',
        entityId: id,
        summary: `Статус ${existing.status} → ${status}`,
      });
      void this.redis.publish(
        'appointments',
        JSON.stringify({ type: 'status', id, status, branchId: appointment.branchId }),
      );
      this.realtime.publish({
        type: 'appointment.status',
        entity: 'Appointment',
        id,
        branchId: appointment.branchId,
        payload: {
          status,
          staffId: appointment.staffId,
          clientName: `${appointment.client.firstName} ${appointment.client.lastName || ''}`.trim(),
          message: `Статус → ${status}: ${appointment.client.firstName}`,
        },
      });

      if (status === AppointmentStatus.CANCELLED || status === AppointmentStatus.NO_SHOW) {
        void this.waitlist?.notifyOpenSlot({
          staffId: appointment.staffId,
          branchId: appointment.branchId,
          startAt: appointment.startAt,
          serviceIds: appointment.services.map((s) => s.serviceId),
        });
      }

      // Auto-refund deposit on cancel (not on no-show — deposit is forfeit)
      const autoRefund =
        process.env.DEPOSIT_AUTO_REFUND_ON_CANCEL !== 'false';
      if (
        autoRefund &&
        status === AppointmentStatus.CANCELLED &&
        existing.depositPaidAt
      ) {
        void this.payments
          .refundDeposit(id, 'Авто-повернення при скасуванні')
          .catch(() => undefined);
      }

      // NO_SHOW: keep deposit as no-show fee (document in notes)
      if (
        status === AppointmentStatus.NO_SHOW &&
        existing.depositPaidAt &&
        existing.depositAmount
      ) {
        const fee = Number(existing.depositAmount);
        await this.prisma.appointment.update({
          where: { id },
          data: {
            notes: [
              appointment.notes,
              `Неявка: депозит ${fee} ₴ утримано як штраф`,
            ]
              .filter(Boolean)
              .join(' · '),
          },
        });
      }
    }

    return appointment;
  }

  /** Smart staff/slot suggestions for client + services */
  async suggest(params: {
    clientId?: string;
    serviceIds: string[];
    date?: string;
    branchId?: string;
  }) {
    const serviceIds = params.serviceIds.filter(Boolean);
    if (!serviceIds.length) throw new BadRequestException('Оберіть послуги');

    const staffLinks = await this.prisma.staffService.findMany({
      where: { serviceId: { in: serviceIds } },
      include: {
        staff: {
          include: {
            user: { select: { isActive: true } },
            services: true,
          },
        },
      },
    });

    const byStaff = new Map<string, { staff: (typeof staffLinks)[0]['staff']; count: number }>();
    for (const link of staffLinks) {
      if (!link.staff.isBookable || !link.staff.user.isActive) continue;
      if (params.branchId && link.staff.branchId && link.staff.branchId !== params.branchId) {
        continue;
      }
      const cur = byStaff.get(link.staffId) || { staff: link.staff, count: 0 };
      cur.count += 1;
      byStaff.set(link.staffId, cur);
    }

    const eligible = Array.from(byStaff.values())
      .filter((x) => x.count >= serviceIds.length)
      .map((x) => x.staff);

    let preferredStaffId: string | null = null;
    if (params.clientId) {
      const last = await this.prisma.appointment.findFirst({
        where: {
          clientId: params.clientId,
          status: { in: [AppointmentStatus.COMPLETED, AppointmentStatus.CONFIRMED] },
          services: { some: { serviceId: { in: serviceIds } } },
        },
        orderBy: { startAt: 'desc' },
      });
      preferredStaffId = last?.staffId || null;
    }

    const date = params.date || new Date().toISOString().slice(0, 10);
    const ranked = await Promise.all(
      eligible.map(async (s) => {
        const slots = await this.getSlots({
          staffId: s.id,
          date,
          serviceIds: serviceIds.join(','),
        });
        return {
          staffId: s.id,
          displayName: s.displayName,
          color: s.color,
          preferred: s.id === preferredStaffId,
          slotsCount: slots.slots.length,
          nextSlots: slots.slots.slice(0, 5),
          durationMin: slots.durationMin,
        };
      }),
    );

    ranked.sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      return b.slotsCount - a.slotsCount;
    });

    return {
      date,
      preferredStaffId,
      suggestions: ranked,
      upsell: await this.upsellHints(serviceIds),
    };
  }

  private async upsellHints(serviceIds: string[]) {
    const recent = await this.prisma.saleItem.findMany({
      where: {
        type: 'SERVICE',
        sale: {
          status: 'PAID',
          items: { some: { refId: { in: serviceIds }, type: 'SERVICE' } },
        },
      },
      take: 200,
      orderBy: { sale: { paidAt: 'desc' } },
    });
    const counts = new Map<string, { name: string; n: number }>();
    for (const item of recent) {
      if (!item.refId || serviceIds.includes(item.refId)) continue;
      const cur = counts.get(item.refId) || { name: item.name, n: 0 };
      cur.n += 1;
      counts.set(item.refId, cur);
    }
    return Array.from(counts.entries())
      .map(([id, v]) => ({ serviceId: id, name: v.name, score: v.n }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  async getSlots(query: SlotsQueryDto) {
    const salon = await this.prisma.salon.findFirst();
    const step = salon?.slotStepMin || 15;
    let durationMin = Number(query.durationMin) || 60;

    if (query.serviceIds) {
      const ids = query.serviceIds.split(',').filter(Boolean);
      if (ids.length) {
        const services = await this.loadServices(ids);
        durationMin = services.reduce((s, x) => s + x.durationMin + x.bufferMin, 0);
      }
    }

    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: query.staffId },
      include: { schedules: true, timeOffs: true },
    });
    if (!staff || !staff.isBookable) return { slots: [], durationMin };

    const day = parseISO(query.date);
    const dayOfWeek = day.getDay(); // 0 Sun
    const schedule = staff.schedules.find((s) => s.dayOfWeek === dayOfWeek);
    if (!schedule || schedule.isDayOff) return { slots: [], durationMin };

    const dayStartLocal = this.timeOnDate(day, schedule.startTime);
    const dayEndLocal = this.timeOnDate(day, schedule.endTime);
    const breakStart = schedule.breakStart ? this.timeOnDate(day, schedule.breakStart) : null;
    const breakEnd = schedule.breakEnd ? this.timeOnDate(day, schedule.breakEnd) : null;

    const dayStart = fromZonedTime(dayStartLocal, TZ);
    const dayEnd = fromZonedTime(dayEndLocal, TZ);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        staffId: query.staffId,
        status: { in: ACTIVE_STATUSES.filter((s) => s !== AppointmentStatus.COMPLETED) },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
    });

    const slots: string[] = [];
    let cursor = dayStart;
    const now = new Date();

    while (addMinutes(cursor, durationMin) <= dayEnd) {
      const slotEnd = addMinutes(cursor, durationMin);
      const localCursor = toZonedTime(cursor, TZ);

      let inBreak = false;
      if (breakStart && breakEnd) {
        const bStart = fromZonedTime(breakStart, TZ);
        const bEnd = fromZonedTime(breakEnd, TZ);
        inBreak = cursor < bEnd && slotEnd > bStart;
      }

      const inTimeOff = staff.timeOffs.some((t) => cursor < t.endAt && slotEnd > t.startAt);
      const conflict = appointments.some((a) => cursor < a.endAt && slotEnd > a.startAt);
      const past = slotEnd <= now;

      if (!inBreak && !inTimeOff && !conflict && !past) {
        slots.push(cursor.toISOString());
      }
      cursor = addMinutes(cursor, step);
    }

    return { slots, durationMin, step };
  }

  private timeOnDate(day: Date, hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    return setMinutes(setHours(startOfDay(day), h), m);
  }

  private async loadServices(ids: string[]) {
    if (!ids.length) throw new BadRequestException('Оберіть хоча б одну послугу');
    const services = await this.prisma.service.findMany({
      where: { id: { in: ids }, isActive: true, deletedAt: null },
    });
    if (services.length !== ids.length) {
      throw new BadRequestException('Деякі послуги недоступні');
    }
    return ids.map((id) => services.find((s) => s.id === id)!);
  }

  private async lockStaffSchedule(
    tx: Prisma.TransactionClient,
    staffId: string,
  ) {
    // Transaction-scoped advisory lock prevents double-booking races
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffId}))`;
  }

  private async assertNoConflictTx(
    tx: Prisma.TransactionClient,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflict = await tx.appointment.findFirst({
      where: {
        staffId,
        id: excludeId ? { not: excludeId } : undefined,
        status: {
          in: [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
          ],
        },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (conflict) {
      throw new ConflictException('Обраний час уже зайнятий у цього майстра');
    }
  }

  private async assertRoomFreeTx(
    tx: Prisma.TransactionClient,
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || !room.isActive) {
      throw new BadRequestException('Кабінет недоступний');
    }
    const overlapping = await tx.appointment.count({
      where: {
        roomId,
        id: excludeId ? { not: excludeId } : undefined,
        status: {
          in: [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
          ],
        },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (overlapping >= (room.capacity || 1)) {
      throw new ConflictException('Кабінет зайнятий у цей час');
    }
  }
}
