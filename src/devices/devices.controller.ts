import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { DevicesService } from './devices.service.js';
import { CreateDeviceDto } from './dto/create-device.dto.js';
import { UpdateDeviceDto } from './dto/update-device.dto.js';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiDeviceFilters,
  ApiEndpoint,
} from '../documentation/api-endpoint.decorator.js';

@ApiTags('Dispositivos')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Criar dispositivo e chaves READ/WRITE',
    access: 'manage',
    body: 'CreateDevice',
    response: 'Device',
    status: 201,
    errors: [400, 404],
    description:
      'As duas chaves são geradas pela API. Não envie apiKeys. O vínculo ao setor é obrigatório e deviceType aceita um único tipo.',
  })
  create(
    @Session() session: UserSession,
    @Body() createDeviceDto: CreateDeviceDto,
  ) {
    return this.devicesService.create(session.user.id, createDeviceDto);
  }

  @Get()
  @ApiDeviceFilters()
  @ApiEndpoint({
    summary: 'Listar dispositivos com localização e última telemetria',
    response: 'DevicePage',
    errors: [400],
    description:
      'Retorna { data, pagination }, ordenado por name e id. Cada item inclui sector, installation, apiKeys e latestTelemetry. Filtros são combinados. Não aceita filtro por tipo. Sem resultados: data vazio, total e totalPages iguais a zero; página além da última retorna data vazio.',
  })
  findAll(
    @Session() session: UserSession,
    @Query() query: Record<string, unknown>,
  ) {
    return this.devicesService.findAll(session.user.id, query);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Consultar dispositivo com localização e última telemetria',
    response: 'DeviceDetails',
    id: 'uuid',
    errors: [400, 404],
  })
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.findOne(session.user.id, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Atualizar dispositivo',
    access: 'manage',
    body: 'UpdateDevice',
    response: 'Device',
    id: 'uuid',
    errors: [400, 404],
    description:
      'Retorna os dados do dispositivo e apiKeys. Consulte o GET para obter setor, instalação e última telemetria.',
  })
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(session.user.id, id, updateDeviceDto);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Excluir dispositivo definitivamente',
    access: 'manage',
    response: 'Deleted',
    id: 'uuid',
    errors: [400, 404],
    description:
      'Exclui em cascata as chaves READ/WRITE e todo o histórico de telemetria do dispositivo.',
  })
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.remove(session.user.id, id);
  }
}
