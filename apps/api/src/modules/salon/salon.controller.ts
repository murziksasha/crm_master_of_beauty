import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SalonService, UpdateSalonDto } from './salon.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('salon')
@ApiBearerAuth()
@Controller('v1/salon')
export class SalonController {
  constructor(
    private salonService: SalonService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  get() {
    return this.salonService.get();
  }

  @Get('staff-config')
  staffConfig() {
    return this.salonService.getStaffConfig();
  }

  @Patch()
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Body() dto: UpdateSalonDto) {
    return this.salonService.update(dto);
  }

  @Get('sms-logs')
  @Roles(Role.OWNER, Role.ADMIN)
  smsLogs(@Query('limit') limit?: string) {
    return this.prisma.smsLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }
}
