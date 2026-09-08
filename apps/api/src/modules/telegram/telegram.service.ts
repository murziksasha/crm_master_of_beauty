import { Injectable, Logger } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { chat: { id: number } };
  };
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private prisma: PrismaService,
    private appointments: AppointmentsService,
  ) {}

  async token() {
    if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
    const salon = await this.prisma.salon.findFirst();
    return salon?.telegramBotToken || '';
  }

  async enabled() {
    if (process.env.TELEGRAM_ENABLED === 'true') return !!(await this.token());
    const salon = await this.prisma.salon.findFirst();
    return !!(salon?.telegramEnabled && (await this.token()));
  }

  async sendMessage(chatId: string | number, text: string, extra?: object) {
    const token = await this.token();
    if (!token) {
      this.logger.log(`[TG:MOCK] → ${chatId} | ${text}`);
      return { ok: true, mock: true };
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra,
      }),
    });
    return res.json().catch(() => ({ ok: false }));
  }

  async notifyClient(clientId: string, text: string, extra?: object) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client?.telegramChatId || !client.telegramOptIn) return { skipped: true };
    return this.sendMessage(client.telegramChatId, text, extra);
  }

  async notifyStaff(staffId: string, text: string) {
    const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffId } });
    if (!staff?.telegramChatId) return { skipped: true };
    return this.sendMessage(staff.telegramChatId, text);
  }

  async handleUpdate(update: TelegramUpdate) {
    const cb = update.callback_query;
    if (cb?.data) {
      await this.handleCallback(cb);
      return { ok: true };
    }
    const msg = update.message;
    if (!msg?.text) return { ok: true };
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    if (text.startsWith('/start')) {
      const payload = text.split(' ')[1] || '';
      if (payload.startsWith('c_')) {
        const clientId = payload.slice(2);
        await this.prisma.client.updateMany({
          where: { id: clientId },
          data: { telegramChatId: chatId, telegramOptIn: true },
        });
        await this.sendMessage(
          chatId,
          'Вітаємо в Master of Beauty! Ви отримуватимете підтвердження записів і нагадування тут.',
        );
        return { ok: true };
      }
      if (payload.startsWith('s_')) {
        const staffId = payload.slice(2);
        await this.prisma.staffProfile.updateMany({
          where: { id: staffId },
          data: { telegramChatId: chatId },
        });
        await this.sendMessage(chatId, 'Кабінет майстра підключено. Ранковий дайджест приходитиме сюди.');
        return { ok: true };
      }
      await this.sendMessage(
        chatId,
        'Master of Beauty бот.\n/balance — бонуси\n/visits — найближчі записи\nЩоб привʼязати кабінет, увійдіть на сайті та натисніть «Підключити Telegram».',
      );
      return { ok: true };
    }

    const client = await this.prisma.client.findFirst({
      where: { telegramChatId: chatId },
    });
    const staff = await this.prisma.staffProfile.findFirst({
      where: { telegramChatId: chatId },
    });

    if (text === '/balance' && client) {
      const loyalty = await this.prisma.loyaltyAccount.findUnique({
        where: { clientId: client.id },
      });
      await this.sendMessage(
        chatId,
        `${client.firstName}, ваш баланс: ${Number(loyalty?.pointsBalance || 0)} балів · ${loyalty?.tier || 'BRONZE'}`,
      );
      return { ok: true };
    }

    if ((text === '/visits' || text === '/schedule') && client) {
      const upcoming = await this.prisma.appointment.findMany({
        where: {
          clientId: client.id,
          startAt: { gte: new Date() },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        include: { staff: true, services: true },
        orderBy: { startAt: 'asc' },
        take: 5,
      });
      if (!upcoming.length) {
        await this.sendMessage(chatId, 'Немає найближчих записів. Записатись: відкрийте /book на сайті.');
        return { ok: true };
      }
      const lines = upcoming.map((a) => {
        const when = a.startAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
        return `• ${when} · ${a.staff.displayName} · ${a.services.map((s) => s.nameSnapshot).join(', ')}`;
      });
      await this.sendMessage(chatId, `Ваші записи:\n${lines.join('\n')}`);
      return { ok: true };
    }

    if (text === '/today' && staff) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);
      const appts = await this.prisma.appointment.findMany({
        where: {
          staffId: staff.id,
          startAt: { gte: dayStart, lte: dayEnd },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
        },
        include: { client: true, services: true },
        orderBy: { startAt: 'asc' },
      });
      const lines = appts.map((a) => {
        const t = a.startAt.toLocaleTimeString('uk-UA', {
          timeZone: 'Europe/Kyiv',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `${t} · ${a.client.firstName} · ${a.services.map((s) => s.nameSnapshot).join(', ')}`;
      });
      await this.sendMessage(
        chatId,
        lines.length ? `Сьогодні:\n${lines.join('\n')}` : 'Сьогодні записів немає.',
      );
      return { ok: true };
    }

    await this.sendMessage(chatId, 'Команди: /start /balance /visits /today');
    return { ok: true };
  }

  private async handleCallback(cb: NonNullable<TelegramUpdate['callback_query']>) {
    const chatId = cb.message?.chat.id;
    const data = cb.data || '';
    const [action, appointmentId] = data.split(':');
    if (!appointmentId) return;
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true },
    });
    if (!appt) return;
    if (action === 'confirm') {
      await this.appointments.updateStatus(appointmentId, AppointmentStatus.CONFIRMED);
      if (chatId) await this.sendMessage(chatId, 'Запис підтверджено. Чекаємо на вас!');
    }
    if (action === 'reschedule') {
      if (chatId) {
        await this.sendMessage(
          chatId,
          'Щоб перенести запис, відкрийте кабінет на сайті (/my) або зателефонуйте в салон.',
        );
      }
    }
  }

  confirmKeyboard(appointmentId: string) {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Підтвердити', callback_data: `confirm:${appointmentId}` },
            { text: 'Перенести', callback_data: `reschedule:${appointmentId}` },
          ],
        ],
      },
    };
  }
}
