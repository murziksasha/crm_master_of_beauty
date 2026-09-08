import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicBookingService, PublicBookDto } from './public-booking.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('public')
@Public()
@Controller('v1/public')
export class PublicBookingController {
  constructor(private publicBookingService: PublicBookingService) {}

  @Get('salon')
  salon() {
    return this.publicBookingService.getSalonPublic();
  }

  @Get('services')
  services() {
    return this.publicBookingService.getCategories();
  }

  @Get('staff')
  staff(
    @Query('serviceId') serviceId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.publicBookingService.getStaff(serviceId, branchId);
  }

  @Get('slots')
  slots(
    @Query('staffId') staffId: string,
    @Query('date') date: string,
    @Query('serviceIds') serviceIds = '',
    @Query('branchId') branchId?: string,
  ) {
    return this.publicBookingService.getSlots(staffId, date, serviceIds, branchId);
  }

  @Get('availability')
  availability(
    @Query('from') from: string,
    @Query('serviceIds') serviceIds = '',
    @Query('staffId') staffId?: string,
    @Query('days') days?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.publicBookingService.getAvailability({
      from,
      serviceIds,
      staffId,
      days: Number(days) || 14,
      branchId,
    });
  }

  @Get('rooms')
  rooms(@Query('branchId') branchId?: string) {
    return this.publicBookingService.getRooms(branchId);
  }

  @Post('bookings')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  book(@Body() dto: PublicBookDto) {
    return this.publicBookingService.book(dto);
  }
}
