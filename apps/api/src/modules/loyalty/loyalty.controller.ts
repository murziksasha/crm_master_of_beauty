import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CreateGiftDto,
  CreatePackageTemplateDto,
  LoyaltyService,
  SellPackageDto,
} from './loyalty.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsNumber, IsOptional, IsString } from 'class-validator';

class AdjustPointsDto {
  @IsNumber() points!: number;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('v1/loyalty')
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  @Get('accounts')
  listAccounts() {
    return this.loyaltyService.listAccounts();
  }

  @Get('clients/:clientId')
  getClient(@Param('clientId') clientId: string) {
    return this.loyaltyService.getClientLoyalty(clientId);
  }

  @Get('packages/templates')
  listTemplates() {
    return this.loyaltyService.listPackageTemplates();
  }

  @Get('packages/client/:clientId')
  listClientPackages(@Param('clientId') clientId: string) {
    return this.loyaltyService.listClientActivePackages(clientId);
  }

  @Post('packages/templates')
  @Roles(Role.OWNER, Role.ADMIN)
  createTemplate(@Body() dto: CreatePackageTemplateDto) {
    return this.loyaltyService.createPackageTemplate(dto);
  }

  @Post('packages/sell')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  sellPackage(@Body() dto: SellPackageDto) {
    return this.loyaltyService.sellPackage(dto);
  }

  @Get('gifts')
  listGifts() {
    return this.loyaltyService.listGifts();
  }

  @Post('gifts')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  createGift(@Body() dto: CreateGiftDto) {
    return this.loyaltyService.createGift(dto);
  }

  @Post('clients/:clientId/adjust')
  @Roles(Role.OWNER, Role.ADMIN)
  adjust(@Param('clientId') clientId: string, @Body() dto: AdjustPointsDto) {
    return this.loyaltyService.adjustPoints(clientId, dto.points, dto.note);
  }
}
