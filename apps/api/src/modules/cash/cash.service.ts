import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AppointmentStatus,
  CashShiftStatus,
  LoyaltyTxType,
  Prisma,
  SaleItemType,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSaleDto, SaleQueryDto } from './dto/cash.dto';
import {
  bomRestoreLines,
  giftBalanceAfterRefund,
  packageSessionsAfterRefund,
} from '../../common/utils/refund-rollback';
import { FiscalService } from '../fiscal/fiscal.service';

@Injectable()
export class CashService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private fiscal?: FiscalService,
  ) {}

  async list(query: SaleQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 30, 100);
    const where: Prisma.SaleWhereInput = {};
    if (query.branchId) where.branchId = query.branchId;
    if (query.from || query.to) {
      where.paidAt = {};
      if (query.from) where.paidAt.gte = new Date(query.from);
      if (query.to) where.paidAt.lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          client: true,
          cashier: { select: { firstName: true, lastName: true } },
          items: true,
        },
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async openShift(cashierId: string, branchId?: string | null, openingFloat = 0) {
    const existing = await this.prisma.cashShift.findFirst({
      where: {
        status: CashShiftStatus.OPEN,
        ...(branchId ? { branchId } : {}),
        cashierId,
      },
    });
    if (existing) return existing;

    return this.prisma.cashShift.create({
      data: {
        cashierId,
        branchId: branchId || undefined,
        openingFloat,
        status: CashShiftStatus.OPEN,
      },
    });
  }

  async currentShift(cashierId: string, branchId?: string | null) {
    return this.prisma.cashShift.findFirst({
      where: {
        status: CashShiftStatus.OPEN,
        cashierId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        _count: { select: { sales: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async closeShift(
    shiftId: string,
    userId: string,
    body: { closingCash: number; notes?: string },
  ) {
    const shift = await this.prisma.cashShift.findUnique({
      where: { id: shiftId },
      include: { sales: true },
    });
    if (!shift) throw new NotFoundException('Зміну не знайдено');
    if (shift.status === CashShiftStatus.CLOSED) {
      throw new BadRequestException('Зміну вже закрито');
    }

    const paidSales = shift.sales.filter((s) => s.status === SaleStatus.PAID);
    const cashFromSales = paidSales.reduce((sum, s) => {
      if (s.method === 'CASH') return sum + Number(s.total);
      if (s.method === 'MIXED') return sum + Number(s.cashAmount || 0);
      return sum;
    }, 0);
    const expectedCash = Number(shift.openingFloat) + cashFromSales;
    const closingCash = Number(body.closingCash);
    const difference = Math.round((closingCash - expectedCash) * 100) / 100;

    const closed = await this.prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        status: CashShiftStatus.CLOSED,
        closedAt: new Date(),
        closedById: userId,
        closingCash,
        expectedCash,
        difference,
        notes: body.notes,
      },
      include: {
        cashier: { select: { firstName: true, lastName: true } },
        sales: { include: { items: true } },
      },
    });

    void this.audit.log({
      userId,
      action: 'OTHER',
      entity: 'CashShift',
      entityId: shiftId,
      summary: `Закрито зміну, різниця ${difference}`,
      meta: { expectedCash, closingCash, difference },
    });

    return closed;
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        cashier: { select: { firstName: true, lastName: true, email: true } },
        items: true,
        appointment: { include: { staff: true } },
        fiscalReceipts: true,
      },
    });
    if (!sale) throw new NotFoundException('Чек не знайдено');
    return sale;
  }

  async create(dto: CreateSaleDto, cashierId: string) {
    if (!dto.items?.length) throw new BadRequestException('Додайте позиції до чека');

    // Clone items — may zero service prices when package sessions are burned
    const items = dto.items.map((i) => ({ ...i }));
    let packageNote = '';
    let sessionsBurned = 0;

    if (dto.packageId) {
      const pkg = await this.prisma.clientPackage.findUnique({
        where: { id: dto.packageId },
        include: { template: true },
      });
      if (!pkg || pkg.sessionsLeft < 1 || pkg.status !== 'ACTIVE') {
        throw new BadRequestException('Абонемент недоступний');
      }
      if (pkg.expiresAt && pkg.expiresAt < new Date()) {
        throw new BadRequestException('Термін абонемента закінчився');
      }
      const packageServiceId = pkg.template?.serviceId || null;
      const want = Math.max(1, Number(dto.packageSessions) || 1);
      const toBurn = Math.min(want, pkg.sessionsLeft);
      // Free up to toBurn matching SERVICE lines (qty contributes to burn count)
      for (const item of items) {
        if (sessionsBurned >= toBurn) break;
        if (item.type !== SaleItemType.SERVICE) continue;
        if (packageServiceId && item.refId && item.refId !== packageServiceId) continue;
        const lineQty = Math.max(1, Math.floor(Number(item.qty) || 1));
        const freeQty = Math.min(lineQty, toBurn - sessionsBurned);
        if (freeQty >= lineQty) {
          item.unitPrice = 0;
        } else if (freeQty > 0) {
          // partial line: average unit price after free portion
          const paidQty = lineQty - freeQty;
          const original = Number(item.unitPrice);
          item.unitPrice = Math.round(((paidQty * original) / lineQty) * 100) / 100;
        }
        sessionsBurned += freeQty;
      }
      if (sessionsBurned < 1) {
        // still deduct 1 session if package selected without matching services
        sessionsBurned = 1;
      }
      packageNote = `Абонемент «${pkg.name}»: −${sessionsBurned} сеанс.`;
    }

    const subtotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
    const discountAmount = Number(dto.discountAmount || 0);
    const loyaltyRedeem = Number(dto.loyaltyRedeem || 0);

    let clientId = dto.clientId;
    let branchId: string | undefined = dto.branchId;
    let depositCredit = 0;
    let depositNote = '';
    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        include: { sale: true },
      });
      if (!appt) throw new NotFoundException('Запис не знайдено');
      if (appt.sale) throw new BadRequestException('За цим записом уже є оплата');
      clientId = clientId || appt.clientId;
      branchId = branchId || appt.branchId || undefined;
      // Paid online deposit reduces amount due at reception
      if (appt.depositPaidAt && appt.depositAmount && Number(appt.depositAmount) > 0) {
        depositCredit = Number(appt.depositAmount);
        depositNote = `Депозит (LiqPay): -${depositCredit} ₴`;
      }
    }

    if (dto.packageId && clientId) {
      const pkg = await this.prisma.clientPackage.findUnique({ where: { id: dto.packageId } });
      if (pkg && pkg.clientId !== clientId) {
        throw new BadRequestException('Абонемент належить іншому клієнту');
      }
    }

    const effectiveDiscount = discountAmount + depositCredit;
    const number = await this.nextSaleNumber();
    const salon = await this.prisma.salon.findFirst();
    let cashShiftId: string | undefined;
    const openShift = await this.prisma.cashShift.findFirst({
      where: {
        status: CashShiftStatus.OPEN,
        cashierId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { openedAt: 'desc' },
    });
    cashShiftId = openShift?.id;

    return this.prisma.$transaction(async (tx) => {
      if (loyaltyRedeem > 0 && clientId) {
        const account = await tx.loyaltyAccount.findUnique({ where: { clientId } });
        if (!account || Number(account.pointsBalance) < loyaltyRedeem) {
          throw new BadRequestException('Недостатньо бонусів');
        }
      }

      for (const item of items) {
        if (item.type === SaleItemType.PRODUCT && item.refId) {
          const product = await tx.product.findUnique({ where: { id: item.refId } });
          if (!product) throw new BadRequestException(`Товар ${item.name} не знайдено`);
          if (Number(product.stockQty) < Number(item.qty)) {
            throw new BadRequestException(`Недостатньо на складі: ${product.name}`);
          }
        }
      }

      if (dto.packageId && clientId && sessionsBurned > 0) {
        const pkg = await tx.clientPackage.findUnique({ where: { id: dto.packageId } });
        if (!pkg || pkg.clientId !== clientId || pkg.sessionsLeft < sessionsBurned) {
          throw new BadRequestException('Абонемент недоступний або замало сеансів');
        }
        const left = pkg.sessionsLeft - sessionsBurned;
        await tx.clientPackage.update({
          where: { id: pkg.id },
          data: {
            sessionsLeft: left,
            status: left <= 0 ? 'EXHAUSTED' : 'ACTIVE',
          },
        });
      }

      let giftRedeem = 0;
      let giftNote = '';
      let giftCertificateId: string | undefined;
      if (dto.giftCode) {
        const code = dto.giftCode.trim().toUpperCase();
        const gift = await tx.giftCertificate.findUnique({ where: { code } });
        if (!gift || !gift.isActive) throw new BadRequestException('Сертифікат недійсний');
        if (gift.expiresAt && gift.expiresAt < new Date()) {
          throw new BadRequestException('Термін сертифіката закінчився');
        }
        const payable = Math.max(0, subtotal - effectiveDiscount - loyaltyRedeem);
        giftRedeem = Math.min(Number(gift.balance), payable);
        if (giftRedeem <= 0) throw new BadRequestException('На сертифікаті немає залишку');
        giftCertificateId = gift.id;
        await tx.giftCertificate.update({
          where: { id: gift.id },
          data: {
            balance: { decrement: giftRedeem },
            isActive: Number(gift.balance) - giftRedeem > 0,
            ownerId: gift.ownerId || clientId || undefined,
          },
        });
        giftNote = `Сертифікат ${code}: -${giftRedeem} ₴`;
      }

      const total = Math.max(0, subtotal - effectiveDiscount - loyaltyRedeem - giftRedeem);
      if (dto.method === 'MIXED') {
        const cash = Number(dto.cashAmount || 0);
        const card = Number(dto.cardAmount || 0);
        if (Math.abs(cash + card - total) > 0.05) {
          throw new BadRequestException(
            `Спліт-оплата має дорівнювати сумі чека (${total} ₴)`,
          );
        }
      }
      const notes =
        [dto.notes, packageNote, depositNote, giftNote].filter(Boolean).join(' · ') || undefined;

      const sale = await tx.sale.create({
        data: {
          number,
          branchId,
          appointmentId: dto.appointmentId,
          clientId,
          cashierId,
          cashShiftId,
          status: SaleStatus.PAID,
          subtotal,
          discountAmount: effectiveDiscount + giftRedeem,
          loyaltyRedeem,
          giftRedeem,
          giftCertificateId,
          packageId: dto.packageId || undefined,
          packageSessionsBurned: sessionsBurned,
          total,
          method: dto.method,
          cashAmount: dto.cashAmount,
          cardAmount: dto.cardAmount,
          notes,
          items: {
            create: items.map((i) => ({
              type: i.type,
              refId: i.refId,
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              total: Number(i.qty) * Number(i.unitPrice),
            })),
          },
        },
        include: { items: true, client: true },
      });

      if (dto.appointmentId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { status: AppointmentStatus.COMPLETED },
        });
      }

      for (const item of items) {
        if (item.type === SaleItemType.PRODUCT && item.refId) {
          await tx.product.update({
            where: { id: item.refId },
            data: { stockQty: { decrement: item.qty } },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.refId,
              type: StockMovementType.SALE,
              qty: item.qty,
              reason: `Продаж ${number}`,
              userId: cashierId,
            },
          });
        }

        // Auto-deduct service material recipes (BOM)
        if (item.type === SaleItemType.SERVICE && item.refId) {
          const materials = await tx.serviceMaterial.findMany({
            where: { serviceId: item.refId },
            include: { product: true },
          });
          for (const mat of materials) {
            const need = Number(mat.qty) * Number(item.qty);
            const product = mat.product;
            if (Number(product.stockQty) < need) {
              throw new BadRequestException(
                `Недостатньо матеріалу «${product.name}» для послуги «${item.name}» (потрібно ${need})`,
              );
            }
            await tx.product.update({
              where: { id: product.id },
              data: { stockQty: { decrement: need } },
            });
            await tx.stockMovement.create({
              data: {
                productId: product.id,
                type: StockMovementType.OUT,
                qty: need,
                reason: `Рецепт послуги ${item.name} · чек ${number}`,
                userId: cashierId,
              },
            });
          }
        }
      }

      if (clientId) {
        let account = await tx.loyaltyAccount.findUnique({ where: { clientId } });
        if (!account) {
          account = await tx.loyaltyAccount.create({ data: { clientId } });
        }

        if (loyaltyRedeem > 0) {
          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: { pointsBalance: { decrement: loyaltyRedeem } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              accountId: account.id,
              type: LoyaltyTxType.REDEEM,
              points: loyaltyRedeem,
              saleId: sale.id,
              note: 'Списання бонусів',
            },
          });
        }

        const earnPct = salon?.loyaltyEarnPercent ?? 5;
        const earnPoints = Math.floor((total * earnPct) / 100);
        if (earnPoints > 0) {
          const updated = await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: {
              pointsBalance: { increment: earnPoints },
              lifetimeSpend: { increment: total },
            },
          });
          await tx.loyaltyTransaction.create({
            data: {
              accountId: account.id,
              type: LoyaltyTxType.EARN,
              points: earnPoints,
              saleId: sale.id,
              note: `Нарахування ${earnPct}%`,
            },
          });
          const spend = Number(updated.lifetimeSpend);
          const tier = spend >= 50000 ? 'GOLD' : spend >= 15000 ? 'SILVER' : 'BRONZE';
          if (tier !== updated.tier) {
            await tx.loyaltyAccount.update({
              where: { id: account.id },
              data: { tier },
            });
          }
        }
      }

      void this.audit.log({
        userId: cashierId,
        action: 'PAYMENT',
        entity: 'Sale',
        entityId: sale.id,
        summary: `Чек ${sale.number} на ${Number(sale.total)}`,
      });

      void this.fiscal?.onSalePaid(sale.id);

      return sale;
    });
  }

  async refund(saleId: string, userId: string, reason?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, loyaltyTx: true },
    });
    if (!sale) throw new NotFoundException('Чек не знайдено');
    if (sale.status === SaleStatus.REFUNDED) {
      throw new BadRequestException('Чек уже сторновано');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (item.type === SaleItemType.PRODUCT && item.refId) {
          await tx.product.update({
            where: { id: item.refId },
            data: { stockQty: { increment: item.qty } },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.refId,
              type: StockMovementType.IN,
              qty: item.qty,
              reason: `Сторно ${sale.number}`,
              userId,
            },
          });
        }
      }

      const serviceIds = sale.items
        .filter((i) => i.type === SaleItemType.SERVICE && i.refId)
        .map((i) => i.refId!) ;
      if (serviceIds.length) {
        const recipes = await tx.serviceMaterial.findMany({
          where: { serviceId: { in: serviceIds } },
          include: { product: true },
        });
        const restore = bomRestoreLines(
          sale.items.map((i) => ({
            type: i.type,
            refId: i.refId,
            name: i.name,
            qty: Number(i.qty),
          })),
          recipes.map((r) => ({
            serviceId: r.serviceId,
            productId: r.productId,
            productName: r.product.name,
            qty: Number(r.qty),
          })),
        );
        for (const line of restore) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: { increment: line.qty } },
          });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              type: StockMovementType.IN,
              qty: line.qty,
              reason: `Сторно рецепту ${sale.number} · ${line.productName}`,
              userId,
            },
          });
        }
      }

      if (sale.packageId && sale.packageSessionsBurned > 0) {
        const pkg = await tx.clientPackage.findUnique({ where: { id: sale.packageId } });
        if (pkg) {
          const next = packageSessionsAfterRefund(
            pkg.sessionsLeft,
            pkg.sessionsTotal,
            sale.packageSessionsBurned,
          );
          await tx.clientPackage.update({
            where: { id: pkg.id },
            data: {
              sessionsLeft: next.sessionsLeft,
              status: next.status as 'ACTIVE' | 'EXHAUSTED',
            },
          });
        }
      }

      const giftAmount = Number(sale.giftRedeem || 0);
      if (sale.giftCertificateId && giftAmount > 0) {
        const gift = await tx.giftCertificate.findUnique({
          where: { id: sale.giftCertificateId },
        });
        if (gift) {
          const next = giftBalanceAfterRefund(
            Number(gift.balance),
            giftAmount,
            Number(gift.initial),
          );
          await tx.giftCertificate.update({
            where: { id: gift.id },
            data: { balance: next.balance, isActive: next.isActive },
          });
        }
      }

      if (sale.clientId && Number(sale.loyaltyRedeem) > 0) {
        const account = await tx.loyaltyAccount.findUnique({
          where: { clientId: sale.clientId },
        });
        if (account) {
          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: { pointsBalance: { increment: sale.loyaltyRedeem } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              accountId: account.id,
              type: LoyaltyTxType.ADJUST,
              points: sale.loyaltyRedeem,
              saleId: sale.id,
              note: 'Повернення бонусів (сторно)',
            },
          });
        }
      }

      const earnTx = sale.loyaltyTx.find((t) => t.type === LoyaltyTxType.EARN);
      if (sale.clientId && earnTx) {
        const account = await tx.loyaltyAccount.findUnique({
          where: { clientId: sale.clientId },
        });
        if (account) {
          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: {
              pointsBalance: { decrement: earnTx.points },
              lifetimeSpend: { decrement: sale.total },
            },
          });
          await tx.loyaltyTransaction.create({
            data: {
              accountId: account.id,
              type: LoyaltyTxType.ADJUST,
              points: -Number(earnTx.points),
              saleId: sale.id,
              note: 'Скасування нарахування (сторно)',
            },
          });
        }
      }

      const refunded = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: SaleStatus.REFUNDED,
          refundedAt: new Date(),
          refundedById: userId,
          refundReason: reason || 'Сторно',
        },
        include: {
          items: true,
          client: true,
          cashier: { select: { firstName: true, lastName: true } },
        },
      });

      void this.audit.log({
        userId,
        action: 'REFUND',
        entity: 'Sale',
        entityId: saleId,
        summary: `Сторно ${sale.number}: ${reason || ''}`,
      });

      void this.fiscal?.onSaleRefund(saleId);

      return refunded;
    });
  }

  async todaySummary(branchId?: string | null) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const sales = await this.prisma.sale.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        status: SaleStatus.PAID,
        ...(branchId ? { branchId } : {}),
      },
    });

    const total = sales.reduce((s, x) => s + Number(x.total), 0);
    const cash = sales
      .filter((s) => s.method === 'CASH' || s.method === 'MIXED')
      .reduce((s, x) => s + Number(x.cashAmount ?? (x.method === 'CASH' ? x.total : 0)), 0);
    const card = sales
      .filter((s) => s.method === 'CARD' || s.method === 'MIXED')
      .reduce((s, x) => s + Number(x.cardAmount ?? (x.method === 'CARD' ? x.total : 0)), 0);

    return { count: sales.length, total, cash, card };
  }

  private async nextSaleNumber() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const prefix = `${y}${m}${d}`;
    const count = await this.prisma.sale.count({
      where: { number: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }
}
