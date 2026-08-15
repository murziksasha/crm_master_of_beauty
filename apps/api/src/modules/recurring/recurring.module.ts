import { Module } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { AppointmentsModule } from '../appointments/appointments.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [AppointmentsModule, BranchesModule],
  providers: [RecurringService],
  controllers: [RecurringController],
})
export class RecurringModule {}
