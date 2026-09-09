import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { WriteApiKeyGuard } from './write-api-key.guard.js';

@Module({
  imports: [DatabaseModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, WriteApiKeyGuard],
})
export class TelemetryModule {}
