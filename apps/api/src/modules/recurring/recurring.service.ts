import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentSource, AppointmentStatus, RecurringFrequency } from '@prisma/client';
import { addMonths, addWeeks } from 'date-fns';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { BranchesService } from '../branches/branches.service';

export class CreateRecurringDto {
  @IsString() clientId!: string;
  @IsString() staffId!: string;
  @IsArray() @IsString({ each: true }) serviceIds!: string[];
  @IsString() startAt!: string;
  @IsOptional() @IsEnum(RecurringFrequency) frequency?: RecurringFrequency;
  @IsOptional() @IsInt() @Min(1) @Max(12) interval?: number;
  @IsOptional() @IsInt() @Min(1) @Max(52) occurrences?: number;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() branchId?: string;
}

@Injectable()
export class RecurringService {
  constructor(
    private prisma: PrismaService,
    private appointments: AppointmentsService,
    private branches: BranchesService,
  ) {}

  list(branchId?: string | null) {
    return this.prisma.recurringSeries.findMany({
      where: {
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        client: true,
        staff: { select: { id: true, displayName: true, color: true } },
        branch: true,
        _count: { select: { appointments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateRecurringDto) {
    if (!dto.serviceIds?.length) throw new BadRequestException('Оберіть послуги');
    const branchId = await this.branches.resolveBranchId(dto.branchId);
    const startAt = new Date(dto.startAt);
    const timeOfDay = `${String(startAt.getHours()).padStart(2, '0')}:${String(startAt.getMinutes()).padStart(2, '0')}`;
    const frequency = dto.frequency || RecurringFrequency.WEEKLY;
    const interval = dto.interval || 1;
    const occurrences = dto.occurrences || 8;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const series = await this.prisma.recurringSeries.create({
      data: {
        branchId,
        clientId: dto.clientId,
        staffId: dto.staffId,
        serviceIds: dto.serviceIds,
        frequency,
        interval,
        startAt,
        endDate: endDate || undefined,
        occurrences,
        timeOfDay,
        notes: dto.notes,
      },
    });

    const dates = this.buildDates(startAt, frequency, interval, occurrences, endDate);
    const created = [];
    const skipped: string[] = [];

    for (const date of dates) {
      try {
        const appt = await this.appointments.create({
          clientId: dto.clientId,
          staffId: dto.staffId,
          serviceIds: dto.serviceIds,
          startAt: date.toISOString(),
          notes: dto.notes,
          source: AppointmentSource.ADMIN,
          status: AppointmentStatus.CONFIRMED,
          branchId,
          seriesId: series.id,
        });
        created.push(appt.id);
      } catch {
        skipped.push(date.toISOString());
      }
    }

    return {
      series,
      createdCount: created.length,
      skippedCount: skipped.length,
      skipped,
    };
  }

  async cancel(id: string, futureOnly = true) {
    const series = await this.prisma.recurringSeries.update({
      where: { id },
      data: { isActive: false },
    });

    if (futureOnly) {
      await this.prisma.appointment.updateMany({
        where: {
          seriesId: id,
          startAt: { gte: new Date() },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        data: { status: AppointmentStatus.CANCELLED },
      });
    }

    return series;
  }

  private buildDates(
    start: Date,
    frequency: RecurringFrequency,
    interval: number,
    occurrences: number,
    endDate: Date | null,
  ) {
    const dates: Date[] = [];
    let cursor = start;
    for (let i = 0; i < occurrences; i++) {
      if (endDate && cursor > endDate) break;
      dates.push(cursor);
      if (frequency === RecurringFrequency.WEEKLY) {
        cursor = addWeeks(cursor, interval);
      } else if (frequency === RecurringFrequency.BIWEEKLY) {
        cursor = addWeeks(cursor, 2 * interval);
      } else {
        cursor = addMonths(cursor, interval);
      }
    }
    return dates;
  }
}
