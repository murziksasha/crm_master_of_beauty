import { Body, Controller, Get, Header, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClosePayrollDto, PayrollService } from './payroll.service';

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('v1/payroll')
@Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
export class PayrollController {
  constructor(private payroll: PayrollService) {}

  @Get()
  list() {
    return this.payroll.list();
  }

  @Get(':id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll-period.csv"')
  exportCsv(@Param('id') id: string) {
    return this.payroll.exportCsv(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.payroll.get(id);
  }

  @Post('close')
  close(
    @Body() dto: ClosePayrollDto,
    @CurrentUser('id') userId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.payroll.close(
      { ...dto, branchId: dto.branchId || branchHeader },
      userId,
    );
  }

  @Post(':id/mark-paid')
  markPaid(@Param('id') id: string) {
    return this.payroll.markPaid(id);
  }

  @Post(':id/reopen')
  @Roles(Role.OWNER, Role.ADMIN)
  reopen(@Param('id') id: string) {
    return this.payroll.reopen(id);
  }

  @Post(':id/unmark-paid')
  @Roles(Role.OWNER, Role.ADMIN)
  unmarkPaid(@Param('id') id: string) {
    return this.payroll.unmarkPaid(id);
  }
}
