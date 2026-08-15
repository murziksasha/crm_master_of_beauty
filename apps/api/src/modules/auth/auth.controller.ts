import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Res,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  private cookieEnabled() {
    return this.config.get('AUTH_COOKIE') === 'true' || process.env.AUTH_COOKIE === 'true';
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    if (!this.cookieEnabled()) return;
    const secure = process.env.NODE_ENV === 'production';
    const common = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
    };
    res.cookie('accessToken', accessToken, { ...common, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, {
      ...common,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, { ip, userAgent });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      dto.refreshToken ||
      (req.cookies?.refreshToken as string | undefined) ||
      '';
    const result = await this.authService.refresh(token, { ip, userAgent });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @ApiBearerAuth()
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      dto?.refreshToken ||
      (req.cookies?.refreshToken as string | undefined);
    const result = await this.authService.logout(token, userId);
    this.clearAuthCookies(res);
    return result;
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }
}
