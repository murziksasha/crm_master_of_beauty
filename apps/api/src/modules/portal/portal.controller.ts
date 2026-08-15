import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import {
  PortalCancelDto,
  PortalRequestDto,
  PortalService,
  PortalVerifyDto,
} from './portal.service';

@ApiTags('portal')
@Public()
@Controller('v1/public/portal')
export class PortalController {
  constructor(
    private portal: PortalService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private async clientIdFromAuth(auth?: string) {
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.slice(7);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET') || 'dev-secret',
      });
      if (payload.typ !== 'portal') throw new UnauthorizedException();
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Сесію кабінету вичерпано');
    }
  }

  @Post('request-code')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  requestCode(@Body() dto: PortalRequestDto) {
    return this.portal.requestCode(dto);
  }

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: PortalVerifyDto) {
    return this.portal.verify(dto);
  }

  @Get('me')
  async me(@Headers('authorization') auth?: string) {
    const clientId = await this.clientIdFromAuth(auth);
    return this.portal.me(clientId);
  }

  @Get('appointments')
  async appointments(@Headers('authorization') auth?: string) {
    const clientId = await this.clientIdFromAuth(auth);
    return this.portal.appointments(clientId);
  }

  @Post('cancel')
  async cancel(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: PortalCancelDto,
  ) {
    const clientId = await this.clientIdFromAuth(auth);
    return this.portal.cancel(clientId, dto);
  }
}
