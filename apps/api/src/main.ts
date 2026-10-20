import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';
import { TenantMiddleware } from './common/tenant.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(new TenantMiddleware().use.bind(new TenantMiddleware()));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: env.corsOrigin || true });

  const config = new DocumentBuilder()
    .setTitle('URA Inteligente API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.apiPort, '0.0.0.0');
  console.log(`API listening on port ${env.apiPort}`);
}

void bootstrap();
