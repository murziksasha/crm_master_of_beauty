import { StockMovementType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() stockQty?: number;
  @IsOptional() @IsNumber() minStock?: number;
  @IsOptional() @IsNumber() costPrice?: number;
  @IsNumber() @Min(0) salePrice!: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() minStock?: number;
  @IsOptional() @IsNumber() costPrice?: number;
  @IsOptional() @IsNumber() salePrice?: number;
  @IsOptional() isActive?: boolean;
}

export class StockMoveDto {
  @IsEnum(StockMovementType) type!: StockMovementType;
  @IsNumber() qty!: number;
  @IsOptional() @IsString() reason?: string;
}

export class CreateProductCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateSupplierDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() notes?: string;
}

export class SupplierInvoiceLineDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsNumber() @Min(0) costPrice!: number;
}

export class CreateSupplierInvoiceDto {
  @IsString() supplierId!: string;
  @IsString() number!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() receivedAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineDto)
  lines?: SupplierInvoiceLineDto[];
}
