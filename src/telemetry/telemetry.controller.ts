import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../documentation/api-endpoint.decorator.js';
import { TelemetryService } from './telemetry.service.js';
import {
  WriteApiKeyGuard,
  type TelemetryRequest,
} from './write-api-key.guard.js';

@ApiTags('Telemetria')
@Controller('telemetry')
export class TelemetryController {
  constructor(
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}
  @Post()
  @AllowAnonymous()
  @UseGuards(WriteApiKeyGuard)
  @ApiEndpoint({
    summary: 'Registrar telemetria do dispositivo IoT',
    access: 'write',
    body: 'CreateTelemetry',
    response: 'Telemetry',
    status: 201,
    errors: [400],
    description:
      'A chave WRITE identifica o dispositivo e sua tabela (ac, dc ou env). Não envie id, deviceId, createdAt ou deviceType. time é obrigatório e deve ter fuso horário. Medidas são strings opcionais/nulas. Campos de outro tipo e tipos act/adv são rejeitados. createdAt é gerado pela API.',
  })
  create(@Req() request: TelemetryRequest, @Body() body: unknown) {
    return this.telemetry.create(request.telemetryDevice, body);
  }
}
