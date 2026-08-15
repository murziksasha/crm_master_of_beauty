import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentSource, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClientsService } from '../clients/clients.service';
import { PaymentsService } from '../payments/payments.service';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class PublicBookDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() @MinLength(9) phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsString() staffId!: string;
  @IsString() startAt!: string;
  @IsArray() @IsString({ each: true }) serviceIds!: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() website?: string; // honeypot
  @IsOptional() @IsBoolean() payDeposit?: boolean;
  @IsOptional() @IsString() roomId?: string;
}

@Injectable()
export class PublicBookingService {
  constructor(
    private prisma: PrismaService,
    private appointmentsService: AppointmentsService,
    private clientsService: ClientsService,
    private payments: PaymentsService,
  ) {}

  async getSalonPublic() {
    const salon = await this.prisma.salon.findFirst({
      include: { branches: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!salon) return null;
    return {
      name: salon.name,
      address: salon.address,
      phone: salon.phone,
      workingHours: salon.workingHours,
      autoConfirmOnline: salon.autoConfirmOnline,
      liqpayEnabled: salon.liqpayEnabled || process.env.LIQPAY_ENABLED === 'true',
      depositEnabled: salon.depositEnabled,
      depositRequired: salon.depositRequired,
      depositPercent: salon.depositPercent,
      mockDepositAllowed:
        process.env.DEPOSIT_MOCK === 'true' ||
        process.env.NODE_ENV !== 'production' ||
        process.env.LIQPAY_SANDBOX === 'true',
      branches: salon.branches.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        address: b.address,
        phone: b.phone,
        isDefault: b.isDefault,
      })),
    };
  }

  async getStaff(serviceId?: string, branchId?: string) {
    const staff = await this.prisma.staffProfile.findMany({
      where: {
        isBookable: true,
        user: { isActive: true },
        ...(branchId ? { branchId } : {}),
        ...(serviceId ? { services: { some: { serviceId } } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        color: true,
        specializations: true,
        photoUrl: true,
        branchId: true,
        services: { select: { serviceId: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return staff;
  }

  async getCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      include: {
        services: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  getSlots(staffId: string, date: string, serviceIds: string) {
    return this.appointmentsService.getSlots({ staffId, date, serviceIds });
  }

  async book(dto: PublicBookDto) {
    if (dto.website) {
      return { ok: true, message: 'Дякуємо за запис' };
    }
    if (!dto.serviceIds?.length) {
      throw new BadRequestException('Оберіть послугу');
    }

    const salon = await this.prisma.salon.findFirst();
    const wantsDeposit =
      !!dto.payDeposit || !!salon?.depositRequired;
    const depositActive =
      wantsDeposit &&
      (salon?.depositEnabled || process.env.LIQPAY_ENABLED === 'true');

    // If deposit required, keep PENDING until LiqPay success
    let status = salon?.autoConfirmOnline
      ? AppointmentStatus.CONFIRMED
      : AppointmentStatus.PENDING;
    if (depositActive) status = AppointmentStatus.PENDING;

    const phone = dto.phone.replace(/[^\d+]/g, '');
    let client = await this.prisma.client.findUnique({ where: { phone } });
    if (!client) {
      try {
        client = await this.clientsService.create({
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          source: 'ONLINE',
        });
      } catch {
        client = await this.prisma.client.findFirst({
          where: { phone: { contains: phone.slice(-9) } },
        });
        if (!client) throw new BadRequestException('Не вдалося створити клієнта');
      }
    }

    const appointment = await this.appointmentsService.create({
      clientId: client.id,
      staffId: dto.staffId,
      startAt: dto.startAt,
      serviceIds: dto.serviceIds,
      source: AppointmentSource.ONLINE,
      status,
      notes: dto.notes,
      branchId: dto.branchId,
      roomId: dto.roomId,
    });

    const servicesTotal = appointment.services.reduce(
      (s, x) => s + Number(x.priceSnapshot),
      0,
    );
    const depositPct = salon?.depositPercent ?? 30;
    const depositAmount = Math.round(((servicesTotal * depositPct) / 100) * 100) / 100;

    let payment:
      | (Awaited<ReturnType<PaymentsService['createLiqPayCheckout']>> & { mock?: boolean })
      | { mock: true; amount: number; appointmentId: string }
      | null = null;

    if (depositActive && depositAmount > 0) {
      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { depositAmount },
      });
      try {
        payment = await this.payments.createLiqPayCheckout({
          appointmentId: appointment.id,
          clientId: client.id,
          amount: depositAmount,
          description: `Депозит ${depositPct}% · запис Master of Beauty`,
          branchId: dto.branchId,
        });
      } catch {
        // Fallback: mock deposit when LiqPay not configured (dev / DEPOSIT_MOCK)
        if (this.payments.isMockDepositAllowed()) {
          payment = {
            mock: true,
            amount: depositAmount,
            appointmentId: appointment.id,
          };
        } else if (salon?.depositRequired) {
          throw new BadRequestException(
            'LiqPay не налаштовано, а депозит обовʼязковий. Увімкніть DEPOSIT_MOCK=true для dev.',
          );
        }
      }
    }

    return {
      ok: true,
      appointment: {
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        staff: appointment.staff,
        services: appointment.services,
        room: (appointment as { room?: unknown }).room,
        depositAmount: depositActive ? depositAmount : null,
        depositPaidAt: null,
      },
      payment,
      mockDepositAllowed: this.payments.isMockDepositAllowed(),
      message: payment
        ? `Запис створено. Сплатіть депозит ${depositAmount} ₴ для підтвердження.`
        : status === AppointmentStatus.CONFIRMED
          ? 'Запис підтверджено! Чекаємо на вас у салоні.'
          : 'Заявку отримано! Адміністратор підтвердить запис.',
    };
  }

  async getRooms(branchId?: string) {
    return this.prisma.room.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        capacity: true,
        color: true,
        branchId: true,
      },
    });
  }
}
