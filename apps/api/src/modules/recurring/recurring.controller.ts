import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CreateRecurringDto, RecurringService } from './recurring.service';
import { BranchId } from '../../common/decorators/branch.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('recurring')
@ApiBearerAuth()
@Controller('v1/recurring')
export class RecurringController {
  constructor(private recurringService: RecurringService) {}

  @Get()
  list(@BranchId() branchId: string | null) {
    return this.recurringService.list(branchId);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  create(@Body() dto: CreateRecurringDto, @BranchId() branchId: string | null) {
    return this.recurringService.create({
      ...dto,
      branchId: dto.branchId || branchId || undefined,
    });
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  cancel(@Param('id') id: string, @Query('futureOnly') futureOnly?: string) {
    return this.recurringService.cancel(id, futureOnly !== '0');
  }
}
