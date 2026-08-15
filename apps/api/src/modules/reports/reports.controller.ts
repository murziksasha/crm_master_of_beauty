import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsOptional, IsString } from 'class-validator';

class PeriodQuery {
  @IsString() from!: string;
  @IsString() to!: string;
  @IsOptional() @IsString() branchId?: string;
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('v1/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /** MASTER: own commission for period */
  @Get('my-commissions')
  @Roles(Role.MASTER, Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  myCommissions(
    @Query() query: PeriodQuery,
    @CurrentUser()
    user?: { id: string; role: Role; staffProfileId?: string | null },
  ) {
    if (user?.role === Role.MASTER) {
      if (!user.staffProfileId) {
        throw new ForbiddenException('Профіль майстра не привʼязано');
      }
      return this.reportsService.myCommissions(
        user.staffProfileId,
        query.from,
        query.to,
      );
    }
    // staff can pass staffId via unused path — owners use full commissions
    throw new ForbiddenException('Використовуйте /reports/commissions');
  }

  @Get('overview')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  overview(
    @Query() query: PeriodQuery,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.reportsService.overview(
      query.from,
      query.to,
      query.branchId || branchHeader,
    );
  }

  @Get('export.csv')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  exportCsv(
    @Query() query: PeriodQuery,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.reportsService.exportCsv(
      query.from,
      query.to,
      query.branchId || branchHeader,
    );
  }

  @Get('commissions')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  commissions(
    @Query() query: PeriodQuery,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.reportsService.commissions(
      query.from,
      query.to,
      query.branchId || branchHeader,
    );
  }

  @Get('inactive-clients')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  inactiveClients(
    @Query('days') days?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.reportsService.inactiveClients(
      days ? Number(days) : 60,
      branchHeader,
    );
  }

  @Get('birthdays')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT)
  birthdays(@Query('days') days?: string) {
    return this.reportsService.birthdays(days ? Number(days) : 7);
  }

  @Get('commissions.csv')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="commissions-payout.csv"')
  exportCommissionsCsv(
    @Query() query: PeriodQuery,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.reportsService.exportCommissionsCsv(
      query.from,
      query.to,
      query.branchId || branchHeader,
    );
  }
}
