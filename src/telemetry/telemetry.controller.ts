import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { TelemetryService } from './telemetry.service.js';
import {
  WriteApiKeyGuard,
  type TelemetryRequest,
} from './write-api-key.guard.js';

@Controller('telemetry')
export class TelemetryController {
  constructor(
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}
  @Post()
  @AllowAnonymous()
  @UseGuards(WriteApiKeyGuard)
  create(@Req() request: TelemetryRequest, @Body() body: unknown) {
    return this.telemetry.create(request.telemetryDevice, body);
  }
}
