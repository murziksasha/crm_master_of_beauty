import { Injectable, Logger } from '@nestjs/common';
import {
  FiscalReceiptStatus,
  FiscalReceiptType,
  PaymentMethod,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const CHECKBOX_BASE = process.env.CHECKBOX_API_URL || 'https://api.checkbox.ua/api/v1';

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);
  private token: string | null = null;
  private tokenExp = 0;

  constructor(private prisma: PrismaService) {}

  isEnabled() {
    return (
      process.env.CHECKBOX_ENABLED === 'true' ||
      process.env.CHECKBOX_LICENSE_KEY ||
      process.env.CHECKBOX_MOCK === 'true'
    );
  }

  private mockMode() {
    if (process.env.CHECKBOX_MOCK === 'true') return true;
    if (process.env.NODE_ENV === 'production') return false;
    return !process.env.CHECKBOX_LICENSE_KEY;
  }

  async onSalePaid(saleId: string) {
    if (!this.isEnabled() && !this.mockMode()) return null;
    try {
      return await this.createSellReceipt(saleId);
    } catch (e) {
      this.logger.error(`Fiscal sell failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async onSaleRefund(saleId: string) {
    if (!this.isEnabled() && !this.mockMode()) return null;
    try {
      return await this.createReturnReceipt(saleId);
    } catch (e) {
      this.logger.error(`Fiscal return failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async createSellReceipt(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, client: true, cashier: true, cashShift: true },
    });
    if (!sale || sale.status !== SaleStatus.PAID) return null;

    const existing = await this.prisma.fiscalReceipt.findFirst({
      where: { saleId, type: FiscalReceiptType.SELL, status: FiscalReceiptStatus.DONE },
    });
    if (existing) return existing;

    const payload = this.saleToCheckbox(sale, 'SELL');
    const result = await this.sendReceipt('sell', payload);

    return this.prisma.fiscalReceipt.create({
      data: {
        saleId,
        type: FiscalReceiptType.SELL,
        status: result.ok ? FiscalReceiptStatus.DONE : FiscalReceiptStatus.ERROR,
        fiscalCode: result.fiscalCode,
        taxUrl: result.taxUrl,
        qrUrl: result.qrUrl,
        shiftId: result.shiftId,
        raw: result.raw as object,
        error: result.error,
      },
    });
  }

  async createReturnReceipt(saleId: string) {
    const original = await this.prisma.fiscalReceipt.findFirst({
      where: { saleId, type: FiscalReceiptType.SELL },
      orderBy: { createdAt: 'desc' },
    });
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, cashier: true },
    });
    if (!sale) return null;

    const payload = this.saleToCheckbox(sale, 'RETURN');
    const result = await this.sendReceipt('sell-return', {
      ...payload,
      related_receipt_id: original?.fiscalCode,
    });

    return this.prisma.fiscalReceipt.create({
      data: {
        saleId,
        type: FiscalReceiptType.RETURN,
        status: result.ok ? FiscalReceiptStatus.DONE : FiscalReceiptStatus.ERROR,
        fiscalCode: result.fiscalCode,
        taxUrl: result.taxUrl,
        qrUrl: result.qrUrl,
        shiftId: result.shiftId,
        raw: result.raw as object,
        error: result.error,
      },
    });
  }

  async openFiscalShift(cashShiftId: string) {
    if (this.mockMode()) {
      const id = `MOCK-SHIFT-${Date.now()}`;
      await this.prisma.cashShift.update({
        where: { id: cashShiftId },
        data: { fiscalShiftId: id },
      });
      return { ok: true, mock: true, shiftId: id };
    }
    const token = await this.signin();
    if (!token) return { ok: false, error: 'no_token' };
    const res = await fetch(`${CHECKBOX_BASE}/shifts`, {
      method: 'POST',
      headers: this.headers(token),
    });
    const raw = await res.json().catch(() => ({}));
    const shiftId = (raw as { id?: string }).id;
    if (shiftId) {
      await this.prisma.cashShift.update({
        where: { id: cashShiftId },
        data: { fiscalShiftId: shiftId },
      });
    }
    return { ok: res.ok, shiftId, raw };
  }

  async closeFiscalShift(cashShiftId: string) {
    const shift = await this.prisma.cashShift.findUnique({ where: { id: cashShiftId } });
    if (this.mockMode()) {
      return { ok: true, mock: true, zReport: true };
    }
    if (!shift?.fiscalShiftId) return { ok: false, error: 'no_fiscal_shift' };
    const token = await this.signin();
    if (!token) return { ok: false, error: 'no_token' };
    const res = await fetch(`${CHECKBOX_BASE}/shifts/close`, {
      method: 'POST',
      headers: this.headers(token),
    });
    const raw = await res.json().catch(() => ({}));
    return { ok: res.ok, raw };
  }

  private saleToCheckbox(
    sale: {
      number: string;
      total: unknown;
      method: PaymentMethod;
      cashAmount?: unknown;
      cardAmount?: unknown;
      items: { name: string; qty: unknown; unitPrice: unknown; total: unknown }[];
    },
    type: 'SELL' | 'RETURN',
  ) {
    const goods = sale.items.map((i, idx) => ({
      good: {
        code: String(idx + 1),
        name: i.name.slice(0, 128),
        price: Math.round(Number(i.unitPrice) * 100),
      },
      quantity: Math.round(Number(i.qty) * 1000),
    }));
    const payments: { type: string; value: number }[] = [];
    if (sale.method === PaymentMethod.CASH) {
      payments.push({ type: 'CASH', value: Math.round(Number(sale.total) * 100) });
    } else if (sale.method === PaymentMethod.CARD || sale.method === PaymentMethod.LIQPAY) {
      payments.push({ type: 'CASHLESS', value: Math.round(Number(sale.total) * 100) });
    } else if (sale.method === PaymentMethod.MIXED) {
      const cash = Math.round(Number(sale.cashAmount || 0) * 100);
      const card = Math.round(Number(sale.cardAmount || 0) * 100);
      if (cash) payments.push({ type: 'CASH', value: cash });
      if (card) payments.push({ type: 'CASHLESS', value: card });
    } else {
      payments.push({ type: 'CASHLESS', value: Math.round(Number(sale.total) * 100) });
    }
    return { goods, payments, delivery: { email: undefined }, type };
  }

  private async sendReceipt(kind: 'sell' | 'sell-return', payload: object) {
    if (this.mockMode()) {
      const fiscalCode = `MOCK-${kind}-${Date.now()}`;
      const taxUrl = `https://cabinet.tax.gov.ua/cashregs/check?id=${fiscalCode}`;
      return {
        ok: true,
        fiscalCode,
        taxUrl,
        qrUrl: taxUrl,
        shiftId: 'mock-shift',
        raw: { mock: true, kind, payload },
      };
    }
    const token = await this.signin();
    if (!token) {
      return { ok: false, error: 'checkbox_auth_failed', raw: {} };
    }
    const res = await fetch(`${CHECKBOX_BASE}/receipts/${kind}`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(payload),
    });
    const raw = (await res.json().catch(() => ({}))) as {
      fiscal_code?: string;
      tax_url?: string;
      id?: string;
      shift?: { id?: string };
    };
    return {
      ok: res.ok,
      fiscalCode: raw.fiscal_code || raw.id,
      taxUrl: raw.tax_url,
      qrUrl: raw.tax_url,
      shiftId: raw.shift?.id,
      raw,
      error: res.ok ? undefined : JSON.stringify(raw),
    };
  }

  private async signin(): Promise<string | null> {
    if (this.token && Date.now() < this.tokenExp) return this.token;
    const salon = await this.prisma.salon.findFirst();
    const license =
      process.env.CHECKBOX_LICENSE_KEY || salon?.checkboxLicenseKey || '';
    const pin = process.env.CHECKBOX_PIN_CODE || salon?.checkboxPinCode || '';
    if (!license || !pin) return null;
    try {
      const res = await fetch(`${CHECKBOX_BASE}/cashier/signinPinCode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': license,
        },
        body: JSON.stringify({ pin_code: pin }),
      });
      const raw = (await res.json().catch(() => ({}))) as {
        access_token?: string;
      };
      if (!res.ok || !raw.access_token) return null;
      this.token = raw.access_token;
      this.tokenExp = Date.now() + 8 * 60 * 60 * 1000;
      return this.token;
    } catch (e) {
      this.logger.warn(`Checkbox signin failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private headers(token: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  list(limit = 50) {
    return this.prisma.fiscalReceipt.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sale: { select: { number: true, total: true, status: true } } },
    });
  }
}
