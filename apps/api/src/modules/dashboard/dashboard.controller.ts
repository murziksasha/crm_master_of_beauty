import { Controller, ForbiddenException, Get, Headers, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  summary(
    @Query('branchId') branchId?: string,
    @Headers('x-branch-id') branchHeader?: string,
    @CurrentUser() user?: { role: Role; staffProfileId?: string | null },
  ) {
    if (user?.role === Role.MASTER && !user.staffProfileId) {
      throw new ForbiddenException('Профіль майстра не привʼязано');
    }
    return this.dashboardService.summary(
      branchId || branchHeader,
      user?.role === Role.MASTER ? user.staffProfileId : null,
    );
  }
}
