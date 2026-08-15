import { Module } from '@nestjs/common';
import { SalonService } from './salon.service';
import { SalonController } from './salon.controller';

@Module({
  providers: [SalonService],
  controllers: [SalonController],
  exports: [SalonService],
})
export class SalonModule {}
