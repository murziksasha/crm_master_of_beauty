import { StockMovementType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() sku?: string;
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
