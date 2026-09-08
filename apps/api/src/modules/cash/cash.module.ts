import { Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  providers: [CashService],
  controllers: [CashController],
  exports: [CashService],
})
export class CashModule {}
