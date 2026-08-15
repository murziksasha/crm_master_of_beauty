import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  StockMoveDto,
  UpdateProductDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  listCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  createCategory(dto: CreateProductCategoryDto) {
    return this.prisma.productCategory.create({
      data: { name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  listProducts(search?: string, branchId?: string | null) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { category: true, branch: true },
      orderBy: { name: 'asc' },
    });
  }

  async lowStock(branchId?: string | null) {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
      include: { category: true },
      orderBy: { stockQty: 'asc' },
    });
    return products.filter((p) => Number(p.stockQty) <= Number(p.minStock));
  }

  async createProduct(dto: CreateProductDto & { branchId?: string }) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        branchId: dto.branchId,
        categoryId: dto.categoryId,
        sku: dto.sku,
        brand: dto.brand,
        unit: dto.unit || 'шт',
        stockQty: dto.stockQty ?? 0,
        minStock: dto.minStock ?? 0,
        costPrice: dto.costPrice ?? 0,
        salePrice: dto.salePrice,
      },
      include: { category: true },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureProduct(id);
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async removeProduct(id: string) {
    await this.ensureProduct(id);
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async moveStock(productId: string, dto: StockMoveDto, userId: string) {
    const product = await this.ensureProduct(productId);
    const qty = Math.abs(Number(dto.qty));
    if (qty <= 0) throw new BadRequestException('Кількість має бути > 0');

    let delta = qty;
    if (dto.type === StockMovementType.OUT || dto.type === StockMovementType.SALE) {
      delta = -qty;
      if (Number(product.stockQty) < qty) {
        throw new BadRequestException('Недостатньо на складі');
      }
    } else if (dto.type === StockMovementType.ADJUST) {
      delta = Number(dto.qty) - Number(product.stockQty);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          stockQty:
            dto.type === StockMovementType.ADJUST
              ? qty
              : { increment: delta },
        },
      });
      await tx.stockMovement.create({
        data: {
          productId,
          type: dto.type,
          qty: Math.abs(delta || qty),
          reason: dto.reason,
          userId,
        },
      });
      return updated;
    });
  }

  private async ensureProduct(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw new NotFoundException('Товар не знайдено');
    return p;
  }
}
