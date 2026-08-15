import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { AppointmentStatus, OnlinePaymentStatus, PaymentMethod } from '@prisma/client';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';

export class CreateLiqPayDto {
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() saleId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() resultUrl?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private branches: BranchesService,
  ) {}

  async createLiqPayCheckout(dto: CreateLiqPayDto) {
    const salon = await this.prisma.salon.findFirst();
    if (!salon) throw new NotFoundException('Салон не налаштовано');

    const publicKey =
      process.env.LIQPAY_PUBLIC_KEY || salon.liqpayPublicKey || '';
    const privateKey =
      process.env.LIQPAY_PRIVATE_KEY || salon.liqpayPrivateKey || '';
    const enabled =
      process.env.LIQPAY_ENABLED === 'true' ||
      salon.liqpayEnabled ||
      (!!publicKey && !!privateKey);

    if (!enabled || !publicKey || !privateKey) {
      throw new BadRequestException(
        'LiqPay не налаштовано. Вкажіть LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY або увімкніть у налаштуваннях.',
      );
    }

    let amount = Number(dto.amount || 0);
    let description = dto.description || 'Оплата Master of Beauty';
    let clientId = dto.clientId;
    let appointmentId = dto.appointmentId;
    let saleId = dto.saleId;
    let branchId = dto.branchId ? await this.branches.resolveBranchId(dto.branchId) : null;

    if (appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { services: true, client: true },
      });
      if (!appt) throw new NotFoundException('Запис не знайдено');
      amount =
        amount ||
        appt.services.reduce((s, x) => s + Number(x.priceSnapshot), 0);
      description = `Передплата запису ${appt.startAt.toLocaleString('uk-UA')}`;
      clientId = clientId || appt.clientId;
      branchId = branchId || appt.branchId;
    }

    if (saleId) {
      const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
      if (!sale) throw new NotFoundException('Чек не знайдено');
      amount = amount || Number(sale.total);
      description = `Оплата чека ${sale.number}`;
      clientId = clientId || sale.clientId || undefined;
      branchId = branchId || sale.branchId;
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('Сума оплати має бути > 0');
    }

    const orderId = `MOB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sandbox =
      process.env.LIQPAY_SANDBOX !== 'false' && (salon.liqpaySandbox ?? true);
    const baseUrl =
      process.env.PUBLIC_BASE_URL ||
      salon.publicBaseUrl ||
      'http://localhost';

    const payment = await this.prisma.onlinePayment.create({
      data: {
        orderId,
        amount,
        currency: 'UAH',
        description,
        status: OnlinePaymentStatus.PENDING,
        provider: 'liqpay',
        clientId,
        appointmentId,
        saleId,
        branchId,
      },
    });

    const params: Record<string, unknown> = {
      public_key: publicKey,
      version: 3,
      action: 'pay',
      amount: Number(amount.toFixed(2)),
      currency: 'UAH',
      description,
      order_id: orderId,
      result_url: dto.resultUrl || `${baseUrl}/book?payment=result&order=${orderId}`,
      server_url: `${baseUrl}/api/v1/payments/liqpay/callback`,
      language: 'uk',
    };
    if (sandbox) {
      // sandbox is controlled by keys from LiqPay sandbox cabinet
      params.sandbox = 1;
    }

    const data = Buffer.from(JSON.stringify(params)).toString('base64');
    const signature = this.sign(privateKey, data, privateKey);

    return {
      paymentId: payment.id,
      orderId,
      amount,
      data,
      signature,
      checkoutUrl: 'https://www.liqpay.ua/api/3/checkout',
      sandbox: !!params.sandbox,
      // For UI form POST
      form: {
        action: 'https://www.liqpay.ua/api/3/checkout',
        data,
        signature,
      },
    };
  }

  async handleLiqPayCallback(data: string, signature: string) {
    const salon = await this.prisma.salon.findFirst();
    const privateKey =
      process.env.LIQPAY_PRIVATE_KEY || salon?.liqpayPrivateKey || '';
    if (!privateKey) {
      throw new BadRequestException('LiqPay private key missing');
    }

    const expected = this.sign(privateKey, data, privateKey);
    if (expected !== signature) {
      this.logger.warn('Invalid LiqPay signature');
      throw new BadRequestException('Invalid signature');
    }

    const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
      order_id: string;
      status: string;
      payment_id?: string | number;
      amount?: number;
    };

    const payment = await this.prisma.onlinePayment.findUnique({
      where: { orderId: payload.order_id },
    });
    if (!payment) {
      this.logger.warn(`Payment not found: ${payload.order_id}`);
      return { ok: false };
    }

    const successStatuses = ['success', 'sandbox', 'wait_accept'];
    const status = successStatuses.includes(payload.status)
      ? OnlinePaymentStatus.SUCCESS
      : payload.status === 'failure' || payload.status === 'error'
        ? OnlinePaymentStatus.FAILURE
        : OnlinePaymentStatus.PENDING;

    await this.prisma.onlinePayment.update({
      where: { id: payment.id },
      data: {
        status,
        liqpayPaymentId: payload.payment_id ? String(payload.payment_id) : undefined,
        rawCallback: payload as object,
        paidAt: status === OnlinePaymentStatus.SUCCESS ? new Date() : undefined,
      },
    });

    if (status === OnlinePaymentStatus.SUCCESS && payment.saleId) {
      await this.prisma.sale.update({
        where: { id: payment.saleId },
        data: { method: PaymentMethod.LIQPAY },
      });
    }

    // Deposit paid for online booking → mark appointment deposit + confirm
    if (status === OnlinePaymentStatus.SUCCESS && payment.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: {
          depositAmount: payment.amount,
          depositPaidAt: new Date(),
          status: AppointmentStatus.CONFIRMED,
        },
      });
      this.logger.log(`Deposit applied to appointment ${payment.appointmentId}`);
    }

    this.logger.log(`LiqPay callback order=${payload.order_id} status=${payload.status}`);
    return { ok: true, status };
  }

  async getByOrderId(orderId: string) {
    const payment = await this.prisma.onlinePayment.findUnique({
      where: { orderId },
      include: { client: true, appointment: true, sale: true },
    });
    if (!payment) throw new NotFoundException('Платіж не знайдено');
    return payment;
  }

  list(limit = 50) {
    return this.prisma.onlinePayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { client: true },
    });
  }

  /** Dev / sandbox: mark deposit paid without LiqPay */
  isMockDepositAllowed() {
    return (
      process.env.DEPOSIT_MOCK === 'true' ||
      process.env.NODE_ENV !== 'production' ||
      process.env.LIQPAY_SANDBOX === 'true'
    );
  }

  async mockDepositPay(appointmentId: string) {
    if (!this.isMockDepositAllowed()) {
      throw new BadRequestException(
        'Mock-депозит вимкнено. Увімкніть DEPOSIT_MOCK=true або використовуйте LiqPay.',
      );
    }
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { services: true, client: true },
    });
    if (!appt) throw new NotFoundException('Запис не знайдено');
    if (appt.depositPaidAt) {
      return {
        ok: true,
        alreadyPaid: true,
        appointmentId: appt.id,
        depositAmount: Number(appt.depositAmount || 0),
      };
    }

    const salon = await this.prisma.salon.findFirst();
    const servicesTotal = appt.services.reduce((s, x) => s + Number(x.priceSnapshot), 0);
    const depositPct = salon?.depositPercent ?? 30;
    const depositAmount =
      Number(appt.depositAmount) > 0
        ? Number(appt.depositAmount)
        : Math.round(((servicesTotal * depositPct) / 100) * 100) / 100;

    if (depositAmount <= 0) {
      throw new BadRequestException('Немає суми для депозиту');
    }

    const orderId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.onlinePayment.create({
        data: {
          orderId,
          amount: depositAmount,
          currency: 'UAH',
          description: `Mock-депозит ${depositPct}%`,
          status: OnlinePaymentStatus.SUCCESS,
          provider: 'mock',
          clientId: appt.clientId,
          appointmentId: appt.id,
          branchId: appt.branchId,
          paidAt: new Date(),
          rawCallback: { mock: true },
        },
      });
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          depositAmount,
          depositPaidAt: new Date(),
          status: AppointmentStatus.CONFIRMED,
        },
      });
    });

    this.logger.log(`Mock deposit paid appointment=${appt.id} amount=${depositAmount}`);
    return {
      ok: true,
      mock: true,
      orderId,
      appointmentId: appt.id,
      depositAmount,
      status: AppointmentStatus.CONFIRMED,
    };
  }

  /**
   * Reverse deposit on cancel / staff action.
   * Clears depositPaidAt; marks related SUCCESS payment as REVERSED.
   * (Real LiqPay refund API is out of scope — accounting flag only.)
   */
  async refundDeposit(appointmentId: string, reason?: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { onlinePay: true, client: true },
    });
    if (!appt) throw new NotFoundException('Запис не знайдено');
    if (!appt.depositPaidAt) {
      throw new BadRequestException('Депозит не сплачено — повертати нічого');
    }

    const amount = Number(appt.depositAmount || appt.onlinePay?.amount || 0);
    await this.prisma.$transaction(async (tx) => {
      if (appt.onlinePay?.id) {
        await tx.onlinePayment.update({
          where: { id: appt.onlinePay.id },
          data: {
            status: OnlinePaymentStatus.REVERSED,
            rawCallback: {
              ...(typeof appt.onlinePay.rawCallback === 'object' &&
              appt.onlinePay.rawCallback
                ? (appt.onlinePay.rawCallback as object)
                : {}),
              refund: {
                at: new Date().toISOString(),
                reason: reason || 'Скасування / повернення депозиту',
                amount,
              },
            },
          },
        });
      }
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          depositPaidAt: null,
          notes: [
            appt.notes,
            `Повернення депозиту ${amount} ₴${reason ? `: ${reason}` : ''}`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      });
    });

    this.logger.log(`Deposit refunded appointment=${appt.id} amount=${amount}`);
    return {
      ok: true,
      appointmentId: appt.id,
      refundedAmount: amount,
      message: `Депозит ${amount} ₴ позначено як повернений (REVERSED).`,
    };
  }

  private sign(privateKey: string, data: string, privateKey2: string) {
    return createHash('sha1')
      .update(privateKey + data + privateKey2)
      .digest('base64');
  }
}
