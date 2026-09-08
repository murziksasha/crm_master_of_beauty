import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { FiscalService } from './fiscal.service';

@ApiTags('fiscal')
@ApiBearerAuth()
@Controller('v1/fiscal')
@Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
export class FiscalController {
  constructor(private fiscal: FiscalService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.fiscal.list(Number(limit) || 50);
  }

  @Post('sales/:id/receipt')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  sell(@Param('id') id: string) {
    return this.fiscal.createSellReceipt(id);
  }

  @Post('sales/:id/return')
  @Roles(Role.OWNER, Role.ADMIN)
  ret(@Param('id') id: string) {
    return this.fiscal.createReturnReceipt(id);
  }

  @Post('shifts/:id/open')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  open(@Param('id') id: string) {
    return this.fiscal.openFiscalShift(id);
  }

  @Post('shifts/:id/close')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  close(@Param('id') id: string) {
    return this.fiscal.closeFiscalShift(id);
  }
}
