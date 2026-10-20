import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() dto: { email: string; password: string }) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: { refreshToken: string }) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload) {
    return this.prisma.user.findUnique({
      where: { id: user.sub },
      include: { tenant: true, extension: true },
    });
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async patchMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: { name?: string; locale?: string; password?: string; currentPassword?: string },
  ) {
    if (dto.password) {
      if (!dto.currentPassword) throw new Error('Informe a senha atual');
      await this.auth.changePassword(userId, dto.currentPassword, dto.password);
    }
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.locale) data.locale = dto.locale;
    return this.prisma.user.update({ where: { id: userId }, data, include: { tenant: true, extension: true } });
  }
}
