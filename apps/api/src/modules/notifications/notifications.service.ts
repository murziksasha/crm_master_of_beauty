import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationChannel = 'sms' | 'email' | 'log';

export type EmailAttachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

export type NotificationPayload = {
  channel?: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  meta?: Record<string, unknown>;
  attachments?: EmailAttachment[];
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async send(payload: NotificationPayload) {
    const channel = payload.channel || 'log';
    if (channel === 'sms') {
      return this.sendSms(payload.to, payload.body, payload.meta);
    }
    if (channel === 'email') {
      return this.sendEmail(
        payload.to,
        payload.subject || 'Master of Beauty',
        payload.body,
        payload.meta,
        payload.attachments,
      );
    }

    this.logger.log(
      `[${channel.toUpperCase()}] → ${payload.to}` +
        (payload.subject ? ` | ${payload.subject}` : '') +
        ` | ${payload.body}`,
    );
    return {
      ok: true,
      channel,
      deliveredAt: new Date().toISOString(),
      mock: true,
    };
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    meta?: Record<string, unknown>,
    attachments?: EmailAttachment[],
  ) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user || 'noreply@masterofbeauty.ua';
    const enabled = process.env.SMTP_ENABLED !== 'false';

    if (!enabled || !host || !user || !pass) {
      this.logger.log(
        `[EMAIL:MOCK] → ${to} | ${subject} | ${body}` +
          (attachments?.length ? ` | attachments=${attachments.map((a) => a.filename).join(',')}` : ''),
      );
      await this.logSms(to, `[email] ${subject}: ${body}`, 'email-mock', 'ok', {
        meta,
        subject,
        attachments: attachments?.map((a) => a.filename),
      });
      return { ok: true, channel: 'email', mock: true };
    }

    try {
      // lightweight SMTP via nodemailer if available; otherwise mock
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer') as typeof import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text: body,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'text/calendar; charset=utf-8; method=REQUEST',
        })),
      });
      this.logger.log(`[EMAIL:SMTP] → ${to} | ${subject}`);
      await this.logSms(to, `[email] ${subject}: ${body}`, 'smtp', 'ok', {
        messageId: info.messageId,
        meta,
        attachments: attachments?.map((a) => a.filename),
      });
      return { ok: true, channel: 'email', mock: false, messageId: info.messageId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Email failed: ${message}`);
      // fallback log
      this.logger.log(`[EMAIL:FALLBACK] → ${to} | ${subject} | ${body}`);
      await this.logSms(to, `[email] ${subject}: ${body}`, 'smtp', 'error', {
        error: message,
        meta,
      });
      return { ok: false, channel: 'email', error: message };
    }
  }

  async sendSms(to: string, body: string, meta?: Record<string, unknown>) {
    const salon = await this.prisma.salon.findFirst();
    const envProvider = (process.env.SMS_PROVIDER || '').toUpperCase();
    const providerName =
      envProvider ||
      salon?.smsProvider ||
      SmsProvider.MOCK;
    const enabled =
      process.env.SMS_ENABLED !== 'false' && (salon?.smsEnabled ?? true);
    const sender =
      process.env.SMS_SENDER || salon?.smsSender || 'BeautyCRM';
    const phone = this.normalizePhone(to);

    if (!enabled) {
      this.logger.log(`[SMS:DISABLED] → ${phone} | ${body}`);
      await this.logSms(phone, body, 'disabled', 'skipped', { meta });
      return { ok: false, mock: true, reason: 'disabled' };
    }

    try {
      if (providerName === SmsProvider.TURBOSMS || providerName === 'TURBOSMS') {
        const result = await this.sendTurboSms(phone, body, sender);
        await this.logSms(phone, body, 'turbosms', result.status, result.response);
        return result;
      }
      if (providerName === SmsProvider.ALPHASMS || providerName === 'ALPHASMS') {
        const result = await this.sendAlphaSms(phone, body, sender);
        await this.logSms(phone, body, 'alphasms', result.status, result.response);
        return result;
      }

      this.logger.log(`[SMS:MOCK] → ${phone} | ${body}`);
      await this.logSms(phone, body, 'mock', 'ok', { mock: true, meta });
      return { ok: true, channel: 'sms', mock: true, deliveredAt: new Date().toISOString() };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`SMS failed: ${message}`);
      await this.logSms(phone, body, String(providerName).toLowerCase(), 'error', { error: message });
      return { ok: false, error: message };
    }
  }

  buildIcs(params: {
    uid: string;
    title: string;
    startAt: Date;
    endAt: Date;
    description?: string;
    location?: string;
  }) {
    const stamp = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const esc = (s: string) => s.replace(/\n/g, '\\n').replace(/,/g, '\\,');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Master of Beauty//CRM//UK',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${params.uid}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(params.startAt)}`,
      `DTEND:${stamp(params.endAt)}`,
      `SUMMARY:${esc(params.title)}`,
      params.description ? `DESCRIPTION:${esc(params.description)}` : '',
      params.location ? `LOCATION:${esc(params.location)}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');
  }

  async appointmentCreated(params: {
    clientPhone: string;
    clientName: string;
    clientEmail?: string | null;
    staffName: string;
    startAt: Date;
    endAt?: Date;
    services: string[];
    status: string;
    source: string;
    appointmentId?: string;
    location?: string;
  }) {
    const when = params.startAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
    const services = params.services.join(', ');
    const body =
      `Вітаємо, ${params.clientName}! Запис Master of Beauty: ${when}, ` +
      `майстер ${params.staffName}, ${services}. Статус: ${params.status}.` +
      (params.clientEmail ? '\n\nУ вкладенні — файл календаря (.ics).' : '');

    await this.send({
      channel: 'sms',
      to: params.clientPhone,
      body: body.split('\n\n')[0],
      meta: { type: 'appointment_created', source: params.source },
    });

    if (params.clientEmail) {
      const endAt =
        params.endAt || new Date(params.startAt.getTime() + 60 * 60 * 1000);
      const ics = this.buildIcs({
        uid: params.appointmentId || `${params.startAt.getTime()}@masterofbeauty`,
        title: `Master of Beauty · ${services}`,
        startAt: params.startAt,
        endAt,
        description: `Майстер: ${params.staffName}`,
        location: params.location,
      });
      await this.send({
        channel: 'email',
        to: params.clientEmail,
        subject: 'Підтвердження запису — Master of Beauty',
        body,
        meta: { type: 'appointment_created', source: params.source },
        attachments: [
          {
            filename: 'appointment.ics',
            content: ics,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });
    }
  }

  async appointmentStatusChanged(params: {
    clientPhone: string;
    clientName: string;
    status: string;
    startAt: Date;
  }) {
    const when = params.startAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
    const statusUk: Record<string, string> = {
      PENDING: 'очікує підтвердження',
      CONFIRMED: 'підтверджено',
      IN_PROGRESS: 'розпочато',
      COMPLETED: 'завершено',
      CANCELLED: 'скасовано',
      NO_SHOW: 'неявка',
    };
    const label = statusUk[params.status] || params.status;
    await this.send({
      channel: 'sms',
      to: params.clientPhone,
      body: `${params.clientName}, статус запису на ${when}: ${label}.`,
      meta: { type: 'appointment_status', status: params.status },
    });
  }

  private async sendTurboSms(phone: string, text: string, sender: string) {
    const token = process.env.TURBOSMS_TOKEN || process.env.SMS_API_KEY;
    if (!token) {
      this.logger.warn('TURBOSMS_TOKEN missing — fallback mock');
      return { ok: true, mock: true, status: 'mock', response: { reason: 'no_token' } };
    }
    const res = await fetch('https://api.turbosms.ua/message/send.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipients: [phone.replace('+', '')],
        sms: { sender, text },
      }),
    });
    const response = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.ok ? 'ok' : 'error', response, mock: false };
  }

  private async sendAlphaSms(phone: string, text: string, sender: string) {
    const apiKey = process.env.ALPHASMS_API_KEY || process.env.SMS_API_KEY;
    if (!apiKey) {
      this.logger.warn('ALPHASMS_API_KEY missing — fallback mock');
      return { ok: true, mock: true, status: 'mock', response: { reason: 'no_key' } };
    }
    const url = new URL('https://alphasms.ua/api/http.php');
    url.searchParams.set('version', 'http');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('command', 'send');
    url.searchParams.set('from', sender);
    url.searchParams.set('to', phone.replace('+', ''));
    url.searchParams.set('message', text);
    const res = await fetch(url.toString());
    const responseText = await res.text();
    return {
      ok: res.ok,
      status: res.ok ? 'ok' : 'error',
      response: { raw: responseText },
      mock: false,
    };
  }

  private async logSms(
    to: string,
    body: string,
    provider: string,
    status: string,
    response?: unknown,
  ) {
    try {
      await this.prisma.smsLog.create({
        data: {
          to,
          body,
          provider,
          status,
          response: (response as object) || undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to write SmsLog: ${e}`);
    }
  }

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
    if (digits.startsWith('380') && !digits.startsWith('+')) return `+${digits}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }
}
