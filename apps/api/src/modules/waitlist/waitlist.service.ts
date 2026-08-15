import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentSource, AppointmentStatus, WaitlistStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClientsService } from '../clients/clients.service';

export class CreateWaitlistDto {
  @IsString() clientId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() preferredDate?: string;
  @IsOptional() @IsString() preferredTimeFrom?: string;
  @IsOptional() @IsString() preferredTimeTo?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateWaitlistDto {
  @IsOptional() @IsEnum(WaitlistStatus) status?: WaitlistStatus;
  @IsOptional() @IsString() preferredDate?: string;
  @IsOptional() @IsString() preferredTimeFrom?: string;
  @IsOptional() @IsString() preferredTimeTo?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() serviceId?: string;
}

export class BookFromWaitlistDto {
  @IsString() staffId!: string;
  @IsString() startAt!: string;
  @IsArray() @IsString({ each: true }) serviceIds!: string[];
  @IsOptional() @IsString() notes?: string;
}

export class PublicWaitlistDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() @MinLength(9) phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() preferredDate?: string;
  @IsOptional() @IsString() preferredTimeFrom?: string;
  @IsOptional() @IsString() preferredTimeTo?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() website?: string;
}

@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private branches: BranchesService,
    private notifications: NotificationsService,
    private appointments: AppointmentsService,
    private clients: ClientsService,
  ) {}

  async list(branchId?: string | null, status?: WaitlistStatus) {
    const bid = branchId ? await this.branches.resolveBranchId(branchId) : undefined;
    return this.prisma.waitlistEntry.findMany({
      where: {
        ...(bid ? { branchId: bid } : {}),
        ...(status
          ? { status }
          : { status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] } }),
      },
      include: {
        client: true,
        service: true,
        staff: { select: { id: true, displayName: true, color: true } },
        branch: true,
      },
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async countWaiting(branchId?: string | null) {
    const bid = branchId ? await this.branches.resolveBranchId(branchId) : undefined;
    return this.prisma.waitlistEntry.count({
      where: {
        ...(bid ? { branchId: bid } : {}),
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] },
      },
    });
  }

  async create(dto: CreateWaitlistDto) {
    const branchId = await this.branches.resolveBranchId(dto.branchId);
    return this.prisma.waitlistEntry.create({
      data: {
        branchId,
        clientId: dto.clientId,
        serviceId: dto.serviceId,
        staffId: dto.staffId,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined,
        preferredTimeFrom: dto.preferredTimeFrom,
        preferredTimeTo: dto.preferredTimeTo,
        notes: dto.notes,
      },
      include: { client: true, service: true, staff: true },
    });
  }

  async publicJoin(dto: PublicWaitlistDto) {
    if (dto.website) return { ok: true, message: 'Дякуємо' };
    const branchId = await this.branches.resolveBranchId(dto.branchId);

    let client = await this.prisma.client.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          { phone: { contains: dto.phone.replace(/\D/g, '').slice(-9) } },
        ],
        deletedAt: null,
      },
    });
    if (!client) {
      client = await this.clients.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        source: 'WAITLIST',
      });
    }

    const entry = await this.create({
      clientId: client.id,
      branchId,
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      preferredDate: dto.preferredDate,
      preferredTimeFrom: dto.preferredTimeFrom,
      preferredTimeTo: dto.preferredTimeTo,
      notes: dto.notes || 'Онлайн лист очікування',
    });

    void this.notifications.send({
      channel: 'sms',
      to: client.phone,
      body: `${client.firstName}, ви в листі очікування Master of Beauty. Ми повідомимо, коли зʼявиться місце.`,
      meta: { type: 'waitlist_joined', waitlistId: entry.id },
    });

    return {
      ok: true,
      id: entry.id,
      message: 'Вас додано до листа очікування. Ми звʼяжемось, коли зʼявиться місце.',
    };
  }

  async update(id: string, dto: UpdateWaitlistDto) {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!entry) throw new NotFoundException('Запис у листі очікування не знайдено');

    const updated = await this.prisma.waitlistEntry.update({
      where: { id },
      data: {
        status: dto.status,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined,
        preferredTimeFrom: dto.preferredTimeFrom,
        preferredTimeTo: dto.preferredTimeTo,
        notes: dto.notes,
        staffId: dto.staffId,
        serviceId: dto.serviceId,
        notifiedAt: dto.status === WaitlistStatus.NOTIFIED ? new Date() : undefined,
      },
      include: { client: true, service: true, staff: true },
    });

    if (dto.status === WaitlistStatus.NOTIFIED) {
      void this.notifications.send({
        channel: 'sms',
        to: entry.client.phone,
        body: `${entry.client.firstName}, зʼявилось вільне місце в Master of Beauty. Зателефонуйте або запишіться онлайн.`,
        meta: { type: 'waitlist_notified', waitlistId: id },
      });
      if (entry.client.email) {
        void this.notifications.send({
          channel: 'email',
          to: entry.client.email,
          subject: 'Вільне місце — Master of Beauty',
          body: `${entry.client.firstName}, зʼявилось вільне місце. Запишіться: /book`,
          meta: { type: 'waitlist_notified', waitlistId: id },
        });
      }
    }

    return updated;
  }

  async book(id: string, dto: BookFromWaitlistDto) {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { id },
      include: { client: true, service: true },
    });
    if (!entry) throw new NotFoundException('Запис у листі очікування не знайдено');
    if (entry.status === WaitlistStatus.BOOKED) {
      throw new BadRequestException('Клієнт уже записаний з цього листа');
    }
    if (entry.status === WaitlistStatus.CANCELLED) {
      throw new BadRequestException('Запис у листі скасовано');
    }

    let serviceIds = dto.serviceIds;
    if (!serviceIds?.length && entry.serviceId) serviceIds = [entry.serviceId];
    if (!serviceIds?.length) throw new BadRequestException('Оберіть послуги');

    const staffId = dto.staffId || entry.staffId;
    if (!staffId) throw new BadRequestException('Оберіть майстра');

    const appointment = await this.appointments.create({
      clientId: entry.clientId,
      staffId,
      startAt: dto.startAt,
      serviceIds,
      source: AppointmentSource.ADMIN,
      status: AppointmentStatus.CONFIRMED,
      notes: dto.notes || entry.notes || undefined,
      branchId: entry.branchId || undefined,
    });

    await this.prisma.waitlistEntry.update({
      where: { id },
      data: { status: WaitlistStatus.BOOKED, staffId: appointment.staffId },
    });

    return { appointment, waitlistId: id };
  }

  async remove(id: string) {
    await this.update(id, { status: WaitlistStatus.CANCELLED });
    return { ok: true };
  }

  /** Auto-notify waiting clients when a slot frees (cancel / no-show) */
  async notifyOpenSlot(params: {
    staffId: string;
    branchId?: string | null;
    startAt: Date;
    serviceIds?: string[];
  }) {
    const dayStart = new Date(params.startAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(params.startAt);
    dayEnd.setHours(23, 59, 59, 999);

    const candidates = await this.prisma.waitlistEntry.findMany({
      where: {
        status: WaitlistStatus.WAITING,
        ...(params.branchId ? { branchId: params.branchId } : {}),
        OR: [
          { staffId: params.staffId },
          { staffId: null },
        ],
        AND: [
          {
            OR: [
              { preferredDate: null },
              { preferredDate: { gte: dayStart, lte: dayEnd } },
            ],
          },
          ...(params.serviceIds?.length
            ? [
                {
                  OR: [
                    { serviceId: null },
                    { serviceId: { in: params.serviceIds } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: { client: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    const when = params.startAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
    for (const entry of candidates) {
      await this.prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: WaitlistStatus.NOTIFIED, notifiedAt: new Date() },
      });
      void this.notifications.send({
        channel: 'sms',
        to: entry.client.phone,
        body:
          `${entry.client.firstName}, зʼявилось місце ~${when} у Master of Beauty. ` +
          `Запишіться онлайн /book або зателефонуйте.`,
        meta: {
          type: 'waitlist_auto_offer',
          waitlistId: entry.id,
          freedStaffId: params.staffId,
        },
      });
      if (entry.client.email) {
        void this.notifications.send({
          channel: 'email',
          to: entry.client.email,
          subject: 'Вільне місце — Master of Beauty',
          body: `${entry.client.firstName}, зʼявилось місце близько ${when}. Запишіться: /book`,
          meta: { type: 'waitlist_auto_offer', waitlistId: entry.id },
        });
      }
    }

    return { notified: candidates.length };
  }
}
