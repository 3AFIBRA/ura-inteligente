import { Controller, Get, Param, UseGuards, NotFoundException, Res, Header, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantContext } from '../prisma/tenant-context.js';

@Controller('recordings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordingsController {
  constructor(private readonly prisma: PrismaService) {}

  private async load(id: string) {
    const t = TenantContext.tenantId();
    const recording = await this.prisma.recording.findFirst({ where: { id, ...(t ? { tenantId: t } : {}) } });
    if (!recording) throw new NotFoundException('Gravação não encontrada');
    if (!existsSync(recording.path)) throw new NotFoundException('Arquivo de gravação não encontrado');
    return recording;
  }

  /** Converte wav -> mp3 (cache ao lado do original). Retorna caminho do mp3. */
  private toMp3(wavPath: string): Promise<string> {
    const mp3Path = wavPath.replace(/\.wav$/i, '.mp3');
    return new Promise((resolve, reject) => {
      if (existsSync(mp3Path) && statSync(mp3Path).size > 0) return resolve(mp3Path);
      const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', '8000', '-ac', '1', mp3Path]);
      let err = '';
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => { code === 0 ? resolve(mp3Path) : reject(new Error(`ffmpeg saiu com ${code}: ${err.slice(0, 200)}`)); });
    });
  }

  /** Download da gravação em MP3. */
  @Get(':id/download.mp3')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const recording = await this.load(id);
    let mp3Path: string;
    try {
      mp3Path = await this.toMp3(recording.path);
    } catch {
      throw new NotFoundException('Não foi possível converter a gravação para MP3');
    }
    const filename = `chamada-${recording.id.slice(0, 8)}.mp3`;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const size = statSync(mp3Path).size;
    res.setHeader('Content-Length', String(size));
    return new StreamableFile(createReadStream(mp3Path));
  }

  /** Streaming da gravação (player no painel). */
  @Get(':id/stream')
  @Header('Cache-Control', 'private, max-age=3600')
  async stream(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const recording = await this.load(id);
    let mp3Path: string;
    try {
      mp3Path = await this.toMp3(recording.path);
    } catch {
      throw new NotFoundException('Não foi possível converter a gravação para MP3');
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${basename(mp3Path)}"`);
    return new StreamableFile(createReadStream(mp3Path));
  }
}
