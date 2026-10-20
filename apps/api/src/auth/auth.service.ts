import { randomBytes, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { env } from '../config/env.js';
import type { JwtPayload } from '../common/current-user.decorator.js';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: JwtPayload }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() }, include: { tenant: true, extension: true } });
    if (!user || !user.active) {
      throw new UnauthorizedException('E-mail ou senha invalidos');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('E-mail ou senha invalidos');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.createSession(user);
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string; user: JwtPayload }> {
    const hash = hashToken(dto.refreshToken);
    const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: { include: { tenant: true, extension: true } } } });
    if (!rt || rt.revokedAt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalido');
    }
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revokedAt: new Date() } });
    return this.createSession(rt.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hash }, data: { revokedAt: new Date() } });
  }

  private createSession(user: Awaited<ReturnType<typeof this.prisma.user.findUnique>>): {
    accessToken: string;
    refreshToken: string;
    user: JwtPayload;
  } {
    if (!user) throw new UnauthorizedException('Usuario invalido');
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = this.jwt.sign(payload);
    const refresh = generateToken();
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    void this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh),
        expiresAt: refreshExpires,
      },
    });
    return { accessToken, refreshToken: refresh, user: payload };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario nao encontrado');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Senha atual incorreta');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  }
}
