import { Catch, type ExceptionFilter, type ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { env } from '../config/env.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const res = error.getResponse();
      const message = typeof res === 'string' ? res : (res as { message?: string | string[] }).message ?? 'Erro';
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${JSON.stringify(message)}`);
      response.status(status).json({
        statusCode: status,
        message,
        error: error.name,
      });
      return;
    }

    const status = 500;
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    this.logger.error(`${request.method} ${request.url} -> ${status}: ${message}`, error instanceof Error ? error.stack : undefined);
    response.status(status).json({
      statusCode: status,
      message: env.nodeEnv === 'production' ? 'Erro interno do servidor' : message,
      error: 'Internal Server Error',
    });
  }
}
