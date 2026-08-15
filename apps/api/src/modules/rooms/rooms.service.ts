import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';

export class CreateRoomDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateRoomDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private branches: BranchesService,
  ) {}

  async list(branchId?: string | null, all = false) {
    const bid = branchId ? await this.branches.resolveBranchId(branchId) : undefined;
    return this.prisma.room.findMany({
      where: {
        ...(bid ? { branchId: bid } : {}),
        ...(all ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateRoomDto) {
    const branchId = dto.branchId
      ? await this.branches.resolveBranchId(dto.branchId)
      : undefined;
    return this.prisma.room.create({
      data: {
        name: dto.name.trim(),
        branchId,
        capacity: dto.capacity ?? 1,
        color: dto.color || '#A78BFA',
        sortOrder: dto.sortOrder ?? 0,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateRoomDto) {
    await this.ensure(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.branchId !== undefined) {
      data.branchId = dto.branchId
        ? await this.branches.resolveBranchId(dto.branchId)
        : null;
    }
    return this.prisma.room.update({ where: { id }, data: data as never });
  }

  async remove(id: string) {
    await this.ensure(id);
    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async ensure(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Кабінет не знайдено');
    return room;
  }
}
