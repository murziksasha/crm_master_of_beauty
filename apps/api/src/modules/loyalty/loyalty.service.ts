import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePackageTemplateDto {
  @IsString() name!: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsNumber() @Min(1) sessionsTotal!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() validityDays?: number;
}

export class SellPackageDto {
  @IsString() clientId!: string;
  @IsString() templateId!: string;
}

export class CreateGiftDto {
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  listAccounts() {
    return this.prisma.loyaltyAccount.findMany({
      include: { client: true },
      orderBy: { pointsBalance: 'desc' },
      take: 100,
    });
  }

  async getClientLoyalty(clientId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { clientId },
      include: {
        client: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!account) throw new NotFoundException('Рахунок лояльності не знайдено');
    const packages = await this.prisma.clientPackage.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return { account, packages };
  }

  listPackageTemplates() {
    return this.prisma.servicePackageTemplate.findMany({
      where: { isActive: true },
      include: { service: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Active packages for client (for cash session burn UI) */
  listClientActivePackages(clientId: string) {
    return this.prisma.clientPackage.findMany({
      where: {
        clientId,
        status: 'ACTIVE',
        sessionsLeft: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      include: { template: { include: { service: true } } },
      orderBy: { expiresAt: 'asc' },
    });
  }

  createPackageTemplate(dto: CreatePackageTemplateDto) {
    return this.prisma.servicePackageTemplate.create({
      data: {
        name: dto.name,
        serviceId: dto.serviceId,
        sessionsTotal: dto.sessionsTotal,
        price: dto.price,
        validityDays: dto.validityDays ?? 90,
      },
    });
  }

  async sellPackage(dto: SellPackageDto) {
    const template = await this.prisma.servicePackageTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template || !template.isActive) throw new NotFoundException('Абонемент не знайдено');
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Клієнта не знайдено');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + template.validityDays);

    return this.prisma.clientPackage.create({
      data: {
        clientId: dto.clientId,
        templateId: template.id,
        name: template.name,
        sessionsTotal: template.sessionsTotal,
        sessionsLeft: template.sessionsTotal,
        pricePaid: template.price,
        expiresAt,
      },
    });
  }

  async createGift(dto: CreateGiftDto) {
    const code = `GIFT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return this.prisma.giftCertificate.create({
      data: {
        code,
        balance: dto.amount,
        initial: dto.amount,
        ownerId: dto.ownerId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  listGifts() {
    return this.prisma.giftCertificate.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async adjustPoints(clientId: string, points: number, note?: string) {
    let account = await this.prisma.loyaltyAccount.findUnique({ where: { clientId } });
    if (!account) account = await this.prisma.loyaltyAccount.create({ data: { clientId } });
    if (Number(account.pointsBalance) + points < 0) {
      throw new BadRequestException('Баланс не може бути від\'ємним');
    }
    const updated = await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: { pointsBalance: { increment: points } },
    });
    await this.prisma.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: 'ADJUST',
        points: Math.abs(points),
        note: note || (points >= 0 ? 'Нарахування' : 'Списання'),
      },
    });
    return updated;
  }
}
