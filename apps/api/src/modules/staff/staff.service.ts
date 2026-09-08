import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStaffDto, TimeOffDto, UpdateStaffDto } from './dto/staff.dto';

const defaultSchedules: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  isDayOff: boolean;
}[] = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: '09:00',
  endTime: '19:00',
  isDayOff: false,
}));

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  list(branchId?: string | null) {
    return this.prisma.staffProfile.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        branch: true,
        schedules: { orderBy: { dayOfWeek: 'asc' } },
        services: { include: { service: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        schedules: { orderBy: { dayOfWeek: 'asc' } },
        timeOffs: { orderBy: { startAt: 'desc' }, take: 20 },
        services: { include: { service: { include: { category: true } } } },
      },
    });
    if (!staff) throw new NotFoundException('Майстра не знайдено');
    return staff;
  }

  async create(dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Користувач з таким email уже існує');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const schedules = dto.schedules?.length ? dto.schedules : defaultSchedules;

    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || Role.MASTER,
        staffProfile: {
          create: {
            branchId: dto.branchId,
            displayName: dto.displayName,
            bio: dto.bio,
            color: dto.color || '#C4A484',
            commissionPct: dto.commissionPct ?? 0,
            productCommissionPct: dto.productCommissionPct ?? 10,
            commissionTiers: dto.commissionTiers as never,
            specializations: dto.specializations || [],
            isBookable: dto.isBookable ?? true,
            schedules: {
              create: schedules.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                breakStart: s.breakStart,
                breakEnd: s.breakEnd,
                isDayOff: s.isDayOff ?? false,
              })),
            },
            services: dto.serviceIds?.length
              ? { create: dto.serviceIds.map((serviceId) => ({ serviceId })) }
              : undefined,
          },
        },
      },
      include: { staffProfile: { include: { schedules: true, services: true } } },
    });
  }

  async update(id: string, dto: UpdateStaffDto) {
    const staff = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: staff.userId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          isActive: dto.isActive,
        },
      });

      await tx.staffProfile.update({
        where: { id },
        data: {
          branchId: dto.branchId,
          displayName: dto.displayName,
          bio: dto.bio,
          color: dto.color,
          commissionPct: dto.commissionPct,
          productCommissionPct: dto.productCommissionPct,
          commissionTiers: dto.commissionTiers as never,
          specializations: dto.specializations,
          isBookable: dto.isBookable,
        },
      });

      if (dto.schedules) {
        await tx.workSchedule.deleteMany({ where: { staffId: id } });
        await tx.workSchedule.createMany({
          data: dto.schedules.map((s) => ({
            staffId: id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            breakStart: s.breakStart,
            breakEnd: s.breakEnd,
            isDayOff: s.isDayOff ?? false,
          })),
        });
      }

      if (dto.serviceIds) {
        await tx.staffService.deleteMany({ where: { staffId: id } });
        if (dto.serviceIds.length) {
          await tx.staffService.createMany({
            data: dto.serviceIds.map((serviceId) => ({ staffId: id, serviceId })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async addTimeOff(id: string, dto: TimeOffDto) {
    await this.findOne(id);
    return this.prisma.timeOff.create({
      data: {
        staffId: id,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        reason: dto.reason,
      },
    });
  }

  async removeTimeOff(staffId: string, timeOffId: string) {
    await this.findOne(staffId);
    return this.prisma.timeOff.delete({ where: { id: timeOffId } });
  }

  listSwaps(staffId?: string) {
    return this.prisma.shiftSwap.findMany({
      where: staffId
        ? { OR: [{ requesterId: staffId }, { peerId: staffId }] }
        : undefined,
      include: {
        requester: { select: { id: true, displayName: true, color: true } },
        peer: { select: { id: true, displayName: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async requestSwap(dto: {
    requesterId: string;
    peerId: string;
    dateFrom: string;
    dateTo: string;
    note?: string;
  }) {
    if (dto.requesterId === dto.peerId) {
      throw new ConflictException('Не можна мінятись із собою');
    }
    await this.findOne(dto.requesterId);
    await this.findOne(dto.peerId);
    return this.prisma.shiftSwap.create({
      data: {
        requesterId: dto.requesterId,
        peerId: dto.peerId,
        dateFrom: new Date(dto.dateFrom),
        dateTo: new Date(dto.dateTo),
        note: dto.note,
      },
      include: {
        requester: { select: { displayName: true } },
        peer: { select: { displayName: true } },
      },
    });
  }

  async peerAcceptSwap(id: string, staffId: string) {
    const swap = await this.prisma.shiftSwap.findUnique({ where: { id } });
    if (!swap) throw new NotFoundException('Запит не знайдено');
    if (swap.peerId !== staffId) throw new ConflictException('Це не ваш запит на обмін');
    if (swap.status !== 'PENDING') throw new ConflictException('Запит уже оброблено');
    return this.prisma.shiftSwap.update({
      where: { id },
      data: { status: 'PEER_ACCEPTED' },
    });
  }

  async decideSwap(id: string, approve: boolean, userId: string) {
    const swap = await this.prisma.shiftSwap.findUnique({ where: { id } });
    if (!swap) throw new NotFoundException('Запит не знайдено');
    if (swap.status === 'APPROVED' || swap.status === 'REJECTED') {
      throw new ConflictException('Запит уже закрито');
    }
    return this.prisma.shiftSwap.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedById: userId,
      },
    });
  }
}
