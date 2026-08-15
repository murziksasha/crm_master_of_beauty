import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WaitlistStatus } from '@prisma/client';
import {
  BookFromWaitlistDto,
  CreateWaitlistDto,
  PublicWaitlistDto,
  UpdateWaitlistDto,
  WaitlistService,
} from './waitlist.service';
import { BranchId } from '../../common/decorators/branch.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('waitlist')
@Controller('v1')
export class WaitlistController {
  constructor(private waitlistService: WaitlistService) {}

  @ApiBearerAuth()
  @Get('waitlist')
  list(
    @BranchId() branchId: string | null,
    @Query('status') status?: WaitlistStatus,
  ) {
    return this.waitlistService.list(branchId, status);
  }

  @ApiBearerAuth()
  @Post('waitlist')
  create(@Body() dto: CreateWaitlistDto, @BranchId() branchId: string | null) {
    return this.waitlistService.create({
      ...dto,
      branchId: dto.branchId || branchId || undefined,
    });
  }

  @ApiBearerAuth()
  @Patch('waitlist/:id')
  update(@Param('id') id: string, @Body() dto: UpdateWaitlistDto) {
    return this.waitlistService.update(id, dto);
  }

  @ApiBearerAuth()
  @Post('waitlist/:id/book')
  book(@Param('id') id: string, @Body() dto: BookFromWaitlistDto) {
    return this.waitlistService.book(id, dto);
  }

  @ApiBearerAuth()
  @Delete('waitlist/:id')
  remove(@Param('id') id: string) {
    return this.waitlistService.remove(id);
  }

  @Public()
  @Post('public/waitlist')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  publicJoin(@Body() dto: PublicWaitlistDto) {
    return this.waitlistService.publicJoin(dto);
  }
}
