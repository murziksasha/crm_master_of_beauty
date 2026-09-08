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
  @IsOptional() @IsBoolean() checkboxEnabled?: boolean;
  @IsOptional() @IsString() checkboxLicenseKey?: string;
  @IsOptional() @IsString() checkboxPinCode?: string;
  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsString() telegramBotToken?: string;
  @IsOptional() @IsNumber() birthdayBonusPoints?: number;
  @IsOptional() @IsBoolean() winbackEnabled?: boolean;
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
      checkboxLicenseKey: salon.checkboxLicenseKey
        ? `${salon.checkboxLicenseKey.slice(0, 4)}***`
        : null,
      checkboxPinCode: salon.checkboxPinCode ? '****' : null,
      telegramBotToken: salon.telegramBotToken
        ? `${salon.telegramBotToken.slice(0, 6)}***`
        : null,
      hasLiqpayPrivateKey: !!salon.liqpayPrivateKey,
      hasCheckboxLicense: !!salon.checkboxLicenseKey,
      hasTelegramBot: !!salon.telegramBotToken,
      env: {
        smsProvider: process.env.SMS_PROVIDER || null,
        liqpayEnabled: process.env.LIQPAY_ENABLED || null,
      },
    };
  }

  /** Stripped config for reception / masters — no payment or SMS secrets. */
  async getStaffConfig() {
    const salon = await this.prisma.salon.findFirst({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
        currency: true,
        timezone: true,
        workingHours: true,
        slotStepMin: true,
        defaultBufferMin: true,
        autoConfirmOnline: true,
        loyaltyEarnPercent: true,
        loyaltyRedeemRate: true,
        depositEnabled: true,
        depositRequired: true,
        depositPercent: true,
        liqpayEnabled: true,
        liqpaySandbox: true,
        checkboxEnabled: true,
        telegramEnabled: true,
        branches: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, slug: true, isDefault: true },
        },
      },
    });
    if (!salon) throw new NotFoundException('Салон не налаштовано');
    return salon;
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
    if (
      typeof dto.checkboxLicenseKey === 'string' &&
      dto.checkboxLicenseKey.includes('***')
    ) {
      delete data.checkboxLicenseKey;
    }
    if (typeof dto.checkboxPinCode === 'string' && dto.checkboxPinCode.includes('*')) {
      delete data.checkboxPinCode;
    }
    if (
      typeof dto.telegramBotToken === 'string' &&
      dto.telegramBotToken.includes('***')
    ) {
      delete data.telegramBotToken;
    }

    return this.prisma.salon.update({
      where: { id: salon.id },
      data: data as never,
    });
  }
}
