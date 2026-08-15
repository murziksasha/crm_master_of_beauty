import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientQueryDto, CreateClientDto, CreateNoteDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ClientQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        include: { loyalty: true, _count: { select: { appointments: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        loyalty: true,
        notesList: { orderBy: { createdAt: 'desc' }, take: 20 },
        packages: {
          where: { status: { in: ['ACTIVE', 'EXHAUSTED'] } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { template: { include: { service: true } } },
        },
        appointments: {
          orderBy: { startAt: 'desc' },
          take: 15,
          include: {
            staff: { select: { displayName: true, color: true } },
            services: true,
          },
        },
        sales: { orderBy: { paidAt: 'desc' }, take: 10 },
      },
    });
    if (!client) throw new NotFoundException('Клієнта не знайдено');
    return client;
  }

  /** Client 360 timeline + metrics */
  async timeline(id: string) {
    const client = await this.findOne(id);
    const [appointments, sales, notes, loyaltyTx] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clientId: id },
        orderBy: { startAt: 'desc' },
        take: 40,
        include: {
          staff: { select: { displayName: true, color: true } },
          services: true,
          sale: { select: { id: true, total: true, number: true, status: true } },
        },
      }),
      this.prisma.sale.findMany({
        where: { clientId: id },
        orderBy: { paidAt: 'desc' },
        take: 40,
        include: { items: true },
      }),
      this.prisma.clientNote.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.loyaltyTransaction.findMany({
        where: { account: { clientId: id } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    type Event = {
      at: string;
      type: 'appointment' | 'sale' | 'note' | 'loyalty';
      title: string;
      meta?: Record<string, unknown>;
    };

    const events: Event[] = [];
    for (const a of appointments) {
      events.push({
        at: a.startAt.toISOString(),
        type: 'appointment',
        title: `${a.status} · ${a.staff.displayName} · ${a.services.map((s) => s.nameSnapshot).join(', ')}`,
        meta: {
          id: a.id,
          status: a.status,
          endAt: a.endAt,
          sale: a.sale,
        },
      });
    }
    for (const s of sales) {
      events.push({
        at: s.paidAt.toISOString(),
        type: 'sale',
        title: `Чек ${s.number} · ${Number(s.total)} ₴ · ${s.status}`,
        meta: { id: s.id, total: s.total, method: s.method, items: s.items },
      });
    }
    for (const n of notes) {
      events.push({
        at: n.createdAt.toISOString(),
        type: 'note',
        title: n.body.slice(0, 120),
        meta: { id: n.id },
      });
    }
    for (const t of loyaltyTx) {
      events.push({
        at: t.createdAt.toISOString(),
        type: 'loyalty',
        title: `${t.type} · ${Number(t.points)} балів`,
        meta: { id: t.id, note: t.note },
      });
    }
    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    const paidSales = sales.filter((s) => s.status === 'PAID');
    const ltv = paidSales.reduce((sum, s) => sum + Number(s.total), 0);
    const completed = appointments.filter((a) => a.status === 'COMPLETED').length;
    const noShow = appointments.filter((a) => a.status === 'NO_SHOW').length;
    const lastVisit = appointments.find((a) =>
      ['COMPLETED', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status),
    );

    return {
      client,
      metrics: {
        ltv: Math.round(ltv * 100) / 100,
        visits: completed,
        noShows: noShow,
        avgCheck: paidSales.length
          ? Math.round((ltv / paidSales.length) * 100) / 100
          : 0,
        lastVisitAt: lastVisit?.startAt || null,
        preferredStaff: lastVisit?.staff?.displayName || null,
      },
      timeline: events.slice(0, 80),
    };
  }

  async create(dto: CreateClientDto) {
    const phone = this.normalizePhone(dto.phone);
    const existing = await this.prisma.client.findUnique({ where: { phone } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('Клієнт з таким телефоном уже існує');
    }

    return this.prisma.client.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim(),
        phone,
        email: dto.email?.toLowerCase(),
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        notes: dto.notes,
        allergies: dto.allergies,
        preferences: dto.preferences,
        source: dto.source,
        tags: dto.tags || [],
        loyalty: { create: {} },
      },
      include: { loyalty: true },
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    if (dto.phone) {
      const phone = this.normalizePhone(dto.phone);
      const other = await this.prisma.client.findFirst({
        where: { phone, id: { not: id }, deletedAt: null },
      });
      if (other) throw new ConflictException('Клієнт з таким телефоном уже існує');
      dto.phone = phone;
    }
    return this.prisma.client.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        email: dto.email?.toLowerCase(),
      },
      include: { loyalty: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async addNote(id: string, dto: CreateNoteDto, authorId?: string) {
    await this.findOne(id);
    return this.prisma.clientNote.create({
      data: { clientId: id, body: dto.body, authorId },
    });
  }

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
    if (digits.startsWith('380') && !digits.startsWith('+')) return `+${digits}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }
}
