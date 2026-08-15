import { Controller, Get, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('v1/insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  @Get('revenue-brief')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  revenueBrief(@Headers('x-branch-id') branchHeader?: string) {
    return this.insights.revenueBrief(branchHeader);
  }
}
