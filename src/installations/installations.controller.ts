import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { InstallationsService } from './installations.service.js';
import { CreateInstallationDto } from './dto/create-installation.dto.js';
import { UpdateInstallationDto } from './dto/update-installation.dto.js';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../documentation/api-endpoint.decorator.js';

@ApiTags('Instalações')
@Controller('installations')
export class InstallationsController {
  constructor(private readonly installationsService: InstallationsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Criar instalação',
    access: 'manage',
    body: 'CreateInstallation',
    response: 'Installation',
    status: 201,
    errors: [400, 404, 409],
  })
  create(
    @Session() session: UserSession,
    @Body() createInstallationDto: CreateInstallationDto,
  ) {
    return this.installationsService.create(
      session.user.id,
      createInstallationDto,
    );
  }

  @Get()
  @ApiEndpoint({
    summary: 'Listar instalações',
    response: 'Installation',
    array: true,
  })
  findAll(@Session() session: UserSession) {
    return this.installationsService.findAll(session.user.id);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Consultar instalação',
    response: 'Installation',
    id: 'uuid',
    errors: [400, 404],
  })
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.installationsService.findOne(session.user.id, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Atualizar instalação',
    access: 'manage',
    body: 'UpdateInstallation',
    response: 'Installation',
    id: 'uuid',
    errors: [400, 404, 409],
  })
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateInstallationDto: UpdateInstallationDto,
  ) {
    return this.installationsService.update(
      session.user.id,
      id,
      updateInstallationDto,
    );
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Excluir instalação definitivamente',
    access: 'manage',
    response: 'Deleted',
    id: 'uuid',
    errors: [400, 404],
    description:
      'Exclui em cascata os setores, dispositivos, chaves e telemetrias desta instalação.',
  })
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.installationsService.remove(session.user.id, id);
  }
}
