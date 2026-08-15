import { Module, forwardRef } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [forwardRef(() => WaitlistModule), PaymentsModule],
  providers: [AppointmentsService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
