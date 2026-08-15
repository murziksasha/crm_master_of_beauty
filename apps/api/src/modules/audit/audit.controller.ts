import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() limit?: number;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit')
@Roles(Role.OWNER, Role.ADMIN)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
