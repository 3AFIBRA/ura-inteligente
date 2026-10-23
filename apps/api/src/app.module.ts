import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AsteriskModule } from './asterisk/asterisk.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { GlobalExceptionFilter } from './common/exception.filter.js';
import { TenantsController } from './tenants/tenants.controller.js';
import { UsersController } from './users/users.controller.js';
import { TrunksController } from './trunks/trunks.controller.js';
import { ExtensionsController } from './extensions/extensions.controller.js';
import { InboundRoutesController, OutboundRoutesController } from './routes/routes.controller.js';
import { QueuesController } from './queues/queues.controller.js';
import { FlowsController } from './flows/flows.controller.js';
import { ErpConnectionsController, WhatsappConnectionsController, SpeechConfigController } from './integrations/integrations.controller.js';
import { CallsController, ReportsController } from './calls/calls.controller.js';
import { HealthController, AsteriskController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AsteriskModule,
  ],
  controllers: [
    TenantsController,
    UsersController,
    TrunksController,
    ExtensionsController,
    InboundRoutesController,
    OutboundRoutesController,
    QueuesController,
    FlowsController,
    ErpConnectionsController,
    WhatsappConnectionsController,
    SpeechConfigController,
    CallsController,
    ReportsController,
    HealthController,
    AsteriskController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
