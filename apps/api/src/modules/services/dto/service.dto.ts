import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateServiceDto {
  @IsString() categoryId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(5) durationMin!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() bufferMin?: number;
  @IsOptional() @IsBoolean() requiresConsultation?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() durationMin?: number;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() bufferMin?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() requiresConsultation?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class ServiceMaterialDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsString() unitNote?: string;
}

export class SetServiceMaterialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceMaterialDto)
  materials!: ServiceMaterialDto[];
}
