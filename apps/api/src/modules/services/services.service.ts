import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateServiceDto,
  UpdateCategoryDto,
  UpdateServiceDto,
} from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  listCategories(includeInactive = false) {
    return this.prisma.serviceCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        services: {
          where: includeInactive ? { deletedAt: null } : { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    const slug =
      dto.slug ||
      dto.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u0400-\u04FF-]+/g, '');
    return this.prisma.serviceCategory.create({
      data: {
        name: dto.name,
        slug,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.ensureCategory(id);
    return this.prisma.serviceCategory.update({ where: { id }, data: dto });
  }

  listServices() {
    return this.prisma.service.findMany({
      where: { deletedAt: null },
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
  }

  async getService(id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        staffLinks: { include: { staff: true } },
        materials: { include: { product: true } },
      },
    });
    if (!service) throw new NotFoundException('Послугу не знайдено');
    return service;
  }

  async getMaterials(serviceId: string) {
    await this.getService(serviceId);
    return this.prisma.serviceMaterial.findMany({
      where: { serviceId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setMaterials(
    serviceId: string,
    materials: { productId: string; qty: number; unitNote?: string }[],
  ) {
    await this.getService(serviceId);
    await this.prisma.$transaction(async (tx) => {
      await tx.serviceMaterial.deleteMany({ where: { serviceId } });
      if (materials.length) {
        await tx.serviceMaterial.createMany({
          data: materials.map((m) => ({
            serviceId,
            productId: m.productId,
            qty: m.qty,
            unitNote: m.unitNote,
          })),
        });
      }
    });
    return this.getMaterials(serviceId);
  }

  async createService(dto: CreateServiceDto) {
    await this.ensureCategory(dto.categoryId);
    return this.prisma.service.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        durationMin: dto.durationMin,
        price: dto.price,
        bufferMin: dto.bufferMin ?? 0,
        requiresConsultation: dto.requiresConsultation ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { category: true },
    });
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    await this.getService(id);
    return this.prisma.service.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async removeService(id: string) {
    await this.getService(id);
    return this.prisma.service.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  private async ensureCategory(id: string) {
    const cat = await this.prisma.serviceCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Категорію не знайдено');
    return cat;
  }
}
