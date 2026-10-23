import { Global, Module } from '@nestjs/common';
import { AmiService } from './ami.service.js';
import { AsteriskConfigService } from './asterisk-config.service.js';

@Global()
@Module({
  providers: [AmiService, AsteriskConfigService],
  exports: [AmiService, AsteriskConfigService],
})
export class AsteriskModule {}
