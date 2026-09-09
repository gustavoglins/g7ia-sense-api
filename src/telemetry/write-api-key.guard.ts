import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { TelemetryService, type TelemetryDevice } from './telemetry.service.js';

export type TelemetryRequest = Request & { telemetryDevice: TelemetryDevice };

@Injectable()
export class WriteApiKeyGuard implements CanActivate {
  constructor(
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<TelemetryRequest>();
    request.telemetryDevice = await this.telemetry.authenticate(
      request.headers['x-api-key'],
    );
    return true;
  }
}
