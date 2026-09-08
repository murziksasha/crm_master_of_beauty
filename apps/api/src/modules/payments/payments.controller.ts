import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CreateLiqPayDto, PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BranchId } from '../../common/decorators/branch.decorator';

@ApiTags('payments')
@Controller('v1/payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTION)
  list(@Query('limit') limit?: string) {
    return this.paymentsService.list(Number(limit) || 50);
  }

  @ApiBearerAuth()
  @Post('liqpay/checkout')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  checkout(@Body() dto: CreateLiqPayDto, @BranchId() branchId: string | null) {
    return this.paymentsService.createLiqPayCheckout({
      ...dto,
      branchId: dto.branchId || branchId || undefined,
    });
  }

  @Public()
  @Post('liqpay/callback')
  callback(@Body() body: { data?: string; signature?: string }) {
    if (!body.data || !body.signature) {
      return { ok: false };
    }
    return this.paymentsService.handleLiqPayCallback(body.data, body.signature);
  }

  @Public()
  @Get('status/:orderId')
  status(@Param('orderId') orderId: string) {
    return this.paymentsService.getByOrderId(orderId);
  }

  /** Staff: mock-pay deposit (local/test only — never public) */
  @ApiBearerAuth()
  @Post('mock-deposit')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  mockDepositStaff(@Body() body: { appointmentId: string }) {
    if (!body?.appointmentId) return { ok: false };
    return this.paymentsService.mockDepositPay(body.appointmentId);
  }

  @ApiBearerAuth()
  @Post('deposit-refund')
  @Roles(Role.OWNER, Role.ADMIN, Role.RECEPTION)
  refundDeposit(@Body() body: { appointmentId: string; reason?: string }) {
    if (!body?.appointmentId) return { ok: false };
    return this.paymentsService.refundDeposit(body.appointmentId, body.reason);
  }
}
