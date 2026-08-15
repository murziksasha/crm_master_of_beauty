import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CashService } from './cash.service';
import { CreateSaleDto, SaleQueryDto } from './dto/cash.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class OpenShiftDto {
  @IsOptional() @IsNumber() @Min(0) openingFloat?: number;
}

class CloseShiftDto {
  @IsNumber() @Min(0) closingCash!: number;
  @IsOptional() @IsString() notes?: string;
}

class RefundDto {
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('cash')
@ApiBearerAuth()
@Controller('v1/cash')
export class CashController {
  constructor(private cashService: CashService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT)
  list(
    @Query() query: SaleQueryDto,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.cashService.list({
      ...query,
      branchId: query.branchId || branchHeader,
    });
  }

  @Get('today')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT)
  today(@Headers('x-branch-id') branchHeader?: string) {
    return this.cashService.todaySummary(branchHeader);
  }

  @Get('shift/current')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  currentShift(
    @CurrentUser('id') userId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.cashService.currentShift(userId, branchHeader);
  }

  @Post('shift/open')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  openShift(
    @Body() dto: OpenShiftDto,
    @CurrentUser('id') userId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.cashService.openShift(userId, branchHeader, dto.openingFloat ?? 0);
  }

  @Post('shift/:id/close')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cashService.closeShift(id, userId, dto);
  }

  @Post(':id/refund')
  @Roles(Role.OWNER, Role.ADMIN)
  refund(
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cashService.refund(id, userId, dto.reason);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT)
  findOne(@Param('id') id: string) {
    return this.cashService.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser('id') userId: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    return this.cashService.create(
      { ...dto, branchId: dto.branchId || branchHeader },
      userId,
    );
  }
}
