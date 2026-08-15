import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsObject() workingHours?: Record<string, unknown>;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsObject() workingHours?: Record<string, unknown>;
}

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  list(activeOnly = false) {
    return this.prisma.branch.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getDefault() {
    const branch =
      (await this.prisma.branch.findFirst({ where: { isDefault: true, isActive: true } })) ||
      (await this.prisma.branch.findFirst({ where: { isActive: true } }));
    if (!branch) throw new NotFoundException('Філії не налаштовані');
    return branch;
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Філію не знайдено');
    return branch;
  }

  async create(dto: CreateBranchDto) {
    const salon = await this.prisma.salon.findFirst();
    if (!salon) throw new NotFoundException('Салон не налаштовано');
    const slug =
      dto.slug ||
      dto.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u0400-\u04FF-]+/g, '');

    if (dto.isDefault) {
      await this.prisma.branch.updateMany({ data: { isDefault: false } });
    }

    return this.prisma.branch.create({
      data: {
        salonId: salon.id,
        name: dto.name,
        slug,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        isDefault: dto.isDefault ?? false,
        workingHours: (dto.workingHours as object) || undefined,
      },
    });
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOne(id);
    if (dto.isDefault) {
      await this.prisma.branch.updateMany({ data: { isDefault: false } });
    }
    return this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
        workingHours: dto.workingHours as object | undefined,
      },
    });
  }

  async resolveBranchId(branchId?: string | null) {
    if (branchId) {
      const b = await this.prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
      if (b) return b.id;
    }
    const def = await this.getDefault();
    return def.id;
  }
}
