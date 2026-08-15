import { Module } from '@nestjs/common';
import { PublicBookingService } from './public-booking.service';
import { PublicBookingController } from './public-booking.controller';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ClientsModule } from '../clients/clients.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AppointmentsModule, ClientsModule, PaymentsModule],
  providers: [PublicBookingService],
  controllers: [PublicBookingController],
})
export class PublicBookingModule {}
