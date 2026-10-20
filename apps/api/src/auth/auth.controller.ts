import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import type { JwtPayload } from '../common/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../common/decorators.js';

const profileSelect = { id: true, email: true, name: true, role: true, locale: true, tenantId: true, tenant: true, extension: { select: { id: true, number: true, name: true, type: true, active: true } }, active: true } as const;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: { email: string; password: string }) {
    return this.auth.login(dto);
  }

  @Public()
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
      select: profileSelect,
    });
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async patchMe(
    @CurrentUser('sub') userId: string,
    @Body() dto: { name?: string; locale?: string; password?: string; currentPassword?: string },
  ) {
    if (dto.password) {
      if (!dto.currentPassword) throw new BadRequestException('Informe a senha atual');
      if (dto.password.length < 8) throw new BadRequestException('A nova senha precisa de ao menos 8 caracteres');
      await this.auth.changePassword(userId, dto.currentPassword, dto.password);
    }
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.locale) data.locale = dto.locale;
    return this.prisma.user.update({ where: { id: userId }, data, select: profileSelect });
  }
}
