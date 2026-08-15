import { AppointmentSource, AppointmentStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsString() clientId!: string;
  @IsString() staffId!: string;
  @IsString() startAt!: string;
  @IsArray() @IsString({ each: true }) serviceIds!: string[];
  @IsOptional() @IsEnum(AppointmentSource) source?: AppointmentSource;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() seriesId?: string;
  @IsOptional() @IsString() roomId?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() startAt?: string;
  @IsOptional() @IsString() endAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceIds?: string[];
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() roomId?: string | null;
}

export class AppointmentQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() staffId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
}

export class SlotsQueryDto {
  @IsString() staffId!: string;
  @IsString() date!: string;
  @IsOptional() @IsString() serviceIds?: string;
  @IsOptional() durationMin?: number;
}

export class UpdateStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}
