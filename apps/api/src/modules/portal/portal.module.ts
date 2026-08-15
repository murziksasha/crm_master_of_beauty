import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [JwtModule.register({}), AppointmentsModule],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
