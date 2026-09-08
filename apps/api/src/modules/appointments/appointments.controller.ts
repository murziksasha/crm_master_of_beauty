import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentQueryDto,
  CreateAppointmentDto,
  SlotsQueryDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/appointment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type AuthUser = {
  id: string;
  role: Role;
  staffProfileId?: string | null;
};

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('v1/appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Query() query: AppointmentQueryDto,
    @Headers('x-branch-id') branchHeader?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const q = {
      ...query,
      branchId: query.branchId || branchHeader,
    };
    if (user?.role === Role.MASTER) {
      if (!user.staffProfileId) throw new ForbiddenException('Профіль майстра не привʼязано');
      q.staffId = user.staffProfileId;
    }
    return this.appointmentsService.findAll(q);
  }

  @Get('changes')
  changes(
    @Query('since') since?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.appointmentsService.changes(since, branchHeader);
  }

  @Get('slots')
  getSlots(@Query() query: SlotsQueryDto, @CurrentUser() user?: AuthUser) {
    if (user?.role === Role.MASTER) {
      if (!user.staffProfileId) throw new ForbiddenException('Профіль майстра не привʼязано');
      query.staffId = user.staffProfileId;
    }
    if (!query.staffId || query.staffId === 'any') {
      return this.appointmentsService.getAnyStaffSlots({
        date: query.date,
        serviceIds: query.serviceIds || '',
        branchId: query.branchId,
      });
    }
    return this.appointmentsService.getSlots(query);
  }

  @Get('availability')
  availability(
    @Query('from') from: string,
    @Query('serviceIds') serviceIds: string,
    @Query('staffId') staffId?: string,
    @Query('days') days?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.appointmentsService.getAvailability({
      from,
      serviceIds: serviceIds || '',
      staffId,
      days: Number(days) || 14,
      branchId: branchHeader,
    });
  }

  @Get('suggest')
  suggest(
    @Query('serviceIds') serviceIds: string,
    @Query('clientId') clientId?: string,
    @Query('date') date?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.appointmentsService.suggest({
      serviceIds: (serviceIds || '').split(',').filter(Boolean),
      clientId,
      date,
      branchId: branchHeader,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const item = await this.appointmentsService.findOne(id);
    if (user?.role === Role.MASTER && item.staffId !== user.staffProfileId) {
      throw new ForbiddenException('Немає доступу до цього запису');
    }
    return item;
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user?: AuthUser) {
    if (user?.role === Role.MASTER) {
      if (!user.staffProfileId) throw new ForbiddenException('Профіль майстра не привʼязано');
      dto.staffId = user.staffProfileId;
    }
    if (user?.role === Role.ACCOUNTANT) {
      throw new ForbiddenException('Бухгалтер не створює записи');
    }
    return this.appointmentsService.create(dto, user?.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user?: AuthUser,
  ) {
    if (user?.role === Role.MASTER) {
      const item = await this.appointmentsService.findOne(id);
      if (item.staffId !== user.staffProfileId) {
        throw new ForbiddenException('Немає доступу до цього запису');
      }
      // master cannot reassign staff
      delete dto.staffId;
    }
    if (user?.role === Role.ACCOUNTANT) {
      throw new ForbiddenException('Немає доступу');
    }
    return this.appointmentsService.update(id, dto);
  }

  @Post(':id/reschedule')
  async reschedule(
    @Param('id') id: string,
    @Body()
    body: {
      startAt?: string;
      endAt?: string;
      durationMin?: number;
      staffId?: string;
      roomId?: string | null;
    },
    @CurrentUser() user?: AuthUser,
  ) {
    if (user?.role === Role.ACCOUNTANT) {
      throw new ForbiddenException('Немає доступу');
    }
    if (user?.role === Role.MASTER) {
      const item = await this.appointmentsService.findOne(id);
      if (item.staffId !== user.staffProfileId) {
        throw new ForbiddenException('Немає доступу до цього запису');
      }
      return this.appointmentsService.reschedule(
        id,
        {
          startAt: body.startAt,
          endAt: body.endAt,
          durationMin: body.durationMin,
          staffId: user.staffProfileId,
          roomId: body.roomId,
        },
        user.id,
      );
    }
    return this.appointmentsService.reschedule(id, body, user?.id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user?: AuthUser,
  ) {
    if (user?.role === Role.MASTER) {
      const item = await this.appointmentsService.findOne(id);
      if (item.staffId !== user.staffProfileId) {
        throw new ForbiddenException('Немає доступу до цього запису');
      }
    }
    if (user?.role === Role.ACCOUNTANT) {
      throw new ForbiddenException('Немає доступу');
    }
    return this.appointmentsService.updateStatus(id, dto.status, user?.id);
  }
}
