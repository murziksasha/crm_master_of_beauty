import { Injectable, NotFoundException } from '@nestjs/common';
import { SmsProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateSalonDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsObject() workingHours?: Record<string, unknown>;
  @IsOptional() @IsNumber() slotStepMin?: number;
  @IsOptional() @IsNumber() defaultBufferMin?: number;
  @IsOptional() @IsBoolean() autoConfirmOnline?: boolean;
  @IsOptional() @IsNumber() loyaltyEarnPercent?: number;
  @IsOptional() @IsNumber() loyaltyRedeemRate?: number;
  @IsOptional() @IsEnum(SmsProvider) smsProvider?: SmsProvider;
  @IsOptional() @IsString() smsSender?: string;
  @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @IsOptional() @IsString() liqpayPublicKey?: string;
  @IsOptional() @IsString() liqpayPrivateKey?: string;
  @IsOptional() @IsBoolean() liqpaySandbox?: boolean;
  @IsOptional() @IsBoolean() liqpayEnabled?: boolean;
  @IsOptional() @IsString() publicBaseUrl?: string;
  @IsOptional() @IsBoolean() depositEnabled?: boolean;
  @IsOptional() @IsBoolean() depositRequired?: boolean;
  @IsOptional() @IsNumber() depositPercent?: number;
}

@Injectable()
export class SalonService {
  constructor(private prisma: PrismaService) {}

  async get() {
    const salon = await this.prisma.salon.findFirst({
      include: { branches: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!salon) throw new NotFoundException('Салон не налаштовано');
    // never expose private key fully in UI — mask
    return {
      ...salon,
      liqpayPrivateKey: salon.liqpayPrivateKey
        ? `${salon.liqpayPrivateKey.slice(0, 4)}***`
        : null,
      hasLiqpayPrivateKey: !!salon.liqpayPrivateKey,
      env: {
        smsProvider: process.env.SMS_PROVIDER || null,
        liqpayEnabled: process.env.LIQPAY_ENABLED || null,
      },
    };
  }

  async update(dto: UpdateSalonDto) {
    const salon = await this.prisma.salon.findFirst();
    if (!salon) throw new NotFoundException('Салон не налаштовано');

    const data: Record<string, unknown> = { ...dto };
    // if masked key sent back, don't overwrite
    if (
      typeof dto.liqpayPrivateKey === 'string' &&
      dto.liqpayPrivateKey.includes('***')
    ) {
      delete data.liqpayPrivateKey;
    }

    return this.prisma.salon.update({
      where: { id: salon.id },
      data: data as never,
    });
  }
}
