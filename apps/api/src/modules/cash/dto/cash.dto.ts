import { PaymentMethod, SaleItemType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaleItemDto {
  @IsEnum(SaleItemType) type!: SaleItemType;
  @IsOptional() @IsString() refId?: string;
  @IsString() name!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsNumber() @Min(0) unitPrice!: number;
}

export class CreateSaleDto {
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) loyaltyRedeem?: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsNumber() cashAmount?: number;
  @IsOptional() @IsNumber() cardAmount?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() packageId?: string;
  /** How many package sessions to burn (default 1). Free matching services up to this count. */
  @IsOptional() @IsNumber() @Min(1) packageSessions?: number;
  @IsOptional() @IsString() giftCode?: string;
}

export class SaleQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}
