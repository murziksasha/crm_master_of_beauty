import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';

export class ScheduleItemDto {
  @IsNumber() dayOfWeek!: number;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsOptional() @IsString() breakStart?: string;
  @IsOptional() @IsString() breakEnd?: string;
  @IsOptional() @IsBoolean() isDayOff?: boolean;
}

export class CreateStaffDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: Role;
  @IsOptional() @IsString() branchId?: string;
  @IsString() displayName!: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() commissionPct?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) specializations?: string[];
  @IsOptional() @IsBoolean() isBookable?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceIds?: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  schedules?: ScheduleItemDto[];
}

export class UpdateStaffDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() commissionPct?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) specializations?: string[];
  @IsOptional() @IsBoolean() isBookable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceIds?: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  schedules?: ScheduleItemDto[];
}

export class TimeOffDto {
  @IsString() startAt!: string;
  @IsString() endAt!: string;
  @IsOptional() @IsString() reason?: string;
}
