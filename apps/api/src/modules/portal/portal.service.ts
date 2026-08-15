import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export class PortalRequestDto {
  @IsString() @MinLength(9) phone!: string;
}

export class PortalVerifyDto {
  @IsString() @MinLength(9) phone!: string;
  @IsString() @MinLength(4) code!: string;
}

export class PortalCancelDto {
  @IsString() appointmentId!: string;
  @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private appointmentsService: AppointmentsService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
    if (digits.startsWith('380') && !digits.startsWith('+')) return `+${digits}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  async requestCode(dto: PortalRequestDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = await this.prisma.client.findFirst({
      where: {
        deletedAt: null,
        OR: [{ phone }, { phone: { endsWith: phone.slice(-9) } }],
      },
    });
    if (!client) {
      // don't leak existence — still return ok
      return {
        ok: true,
        message: 'Якщо номер зареєстровано, код надіслано SMS.',
      };
    }

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.clientPortalOtp.create({
      data: {
        clientId: client.id,
        codeHash: this.hash(code),
        expiresAt,
      },
    });

    await this.notifications.send({
      channel: 'sms',
      to: client.phone,
      body: `Master of Beauty: код входу в кабінет ${code}. Дійсний 10 хв.`,
      meta: { type: 'portal_otp', clientId: client.id },
    });

    const devCode =
      process.env.NODE_ENV !== 'production' || process.env.PORTAL_DEV_CODE === 'true'
        ? code
        : undefined;

    return {
      ok: true,
      message: 'Код надіслано SMS (якщо номер у базі).',
      ...(devCode ? { devCode } : {}),
    };
  }

  async verify(dto: PortalVerifyDto) {
    const phone = this.normalizePhone(dto.phone);
    const client = await this.prisma.client.findFirst({
      where: {
        deletedAt: null,
        OR: [{ phone }, { phone: { endsWith: phone.slice(-9) } }],
      },
      include: { loyalty: true },
    });
    if (!client) throw new UnauthorizedException('Невірний код або телефон');

    const otp = await this.prisma.clientPortalOtp.findFirst({
      where: {
        clientId: client.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.codeHash !== this.hash(dto.code.trim())) {
      throw new UnauthorizedException('Невірний або прострочений код');
    }

    await this.prisma.clientPortalOtp.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    const token = await this.jwt.signAsync(
      { sub: client.id, typ: 'portal' },
      {
        secret: this.config.get('JWT_ACCESS_SECRET') || 'dev-secret',
        expiresIn: '7d',
      },
    );

    return {
      token,
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email,
        loyalty: client.loyalty,
      },
    };
  }

  async me(clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      include: { loyalty: true, packages: { where: { status: 'ACTIVE' } } },
    });
    if (!client) throw new NotFoundException();
    return client;
  }

  async appointments(clientId: string) {
    const now = new Date();
    const items = await this.prisma.appointment.findMany({
      where: { clientId },
      include: {
        staff: { select: { displayName: true, color: true } },
        services: true,
        room: { select: { name: true } },
        sale: { select: { id: true, total: true, number: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 40,
    });
    return {
      upcoming: items.filter(
        (a) =>
          a.startAt >= now &&
          !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status),
      ),
      past: items.filter(
        (a) =>
          a.startAt < now ||
          ['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status),
      ),
    };
  }

  async cancel(clientId: string, dto: PortalCancelDto) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, clientId },
    });
    if (!appt) throw new NotFoundException('Запис не знайдено');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appt.status)) {
      throw new BadRequestException('Запис уже закрито');
    }
    const hoursLeft = (appt.startAt.getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < 3) {
      throw new BadRequestException(
        'Скасування можливе не пізніше ніж за 3 години до візиту. Зателефонуйте в салон.',
      );
    }
    await this.prisma.appointment.update({
      where: { id: appt.id },
      data: {
        notes: [appt.notes, dto.reason ? `Скасовано клієнтом: ${dto.reason}` : 'Скасовано клієнтом']
          .filter(Boolean)
          .join(' · '),
      },
    });
    return this.appointmentsService.updateStatus(appt.id, AppointmentStatus.CANCELLED);
  }
}
