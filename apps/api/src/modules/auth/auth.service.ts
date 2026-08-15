import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
    private audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const emailKey = `login:fail:${dto.email.toLowerCase()}`;
    const fails = await this.redis.incr(emailKey, 900);
    if (fails > 20) {
      throw new UnauthorizedException('Забагато спроб входу. Спробуйте пізніше.');
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Невірний email або пароль');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Невірний email або пароль');

    await this.redis.del(emailKey);
    const tokens = await this.issueTokens(user.id, user.email, user.role, meta);
    void this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      summary: `Вхід ${user.email}`,
      ip: meta?.ip,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        staffProfileId: user.staffProfile?.id ?? null,
      },
      ...tokens,
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone,
      staffProfileId: user.staffProfile?.id ?? null,
      staffProfile: user.staffProfile,
    };
  }

  async refresh(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
    if (!refreshToken) throw new UnauthorizedException('Недійсний refresh token');

    let payload: { sub: string; email: string; role: string; jti?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Недійсний refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // reuse detection: revoke all for user if token was already rotated
      if (payload.sub) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: payload.sub, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Недійсний refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException();

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, user.role, meta);
  }

  async logout(refreshToken?: string, userId?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (userId) {
      void this.audit.log({
        userId,
        action: 'LOGOUT',
        entity: 'User',
        entityId: userId,
        summary: 'Вихід',
      });
    }
    return { ok: true };
  }

  private async issueTokens(
    sub: string,
    email: string,
    role: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const jti = randomBytes(16).toString('hex');
    const payload = { sub, email, role, jti };
    const accessExpires = (this.config.get<string>('JWT_ACCESS_EXPIRES') || '15m') as `${number}m`;
    const refreshExpires = (this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d') as `${number}d`;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpires,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpires,
      }),
    ]);

    const expiresAt = this.parseExpiry(refreshExpires);
    await this.prisma.refreshToken.create({
      data: {
        userId: sub,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent?.slice(0, 300),
      },
    });

    // keep only last 10 active refresh tokens per user
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId: sub, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (tokens.length) {
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: tokens.map((t) => t.id) } },
        data: { revokedAt: new Date() },
      });
    }

    return { accessToken, refreshToken };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(exp: string): Date {
    const m = /^(\d+)([smhd])$/.exec(exp);
    const n = m ? Number(m[1]) : 7;
    const unit = m?.[2] || 'd';
    const ms =
      unit === 's'
        ? n * 1000
        : unit === 'm'
          ? n * 60_000
          : unit === 'h'
            ? n * 3_600_000
            : n * 86_400_000;
    return new Date(Date.now() + ms);
  }
}
