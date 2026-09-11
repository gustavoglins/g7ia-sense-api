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
import { SectorsService } from './sectors.service.js';
import { CreateSectorDto } from './dto/create-sector.dto.js';
import { UpdateSectorDto } from './dto/update-sector.dto.js';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEndpoint,
  ApiInstallationFilter,
} from '../documentation/api-endpoint.decorator.js';

@ApiTags('Setores')
@Controller('sectors')
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Criar setor',
    access: 'manage',
    body: 'CreateSector',
    response: 'Sector',
    status: 201,
    errors: [400, 404, 409],
  })
  create(
    @Session() session: UserSession,
    @Body() createSectorDto: CreateSectorDto,
  ) {
    return this.sectorsService.create(session.user.id, createSectorDto);
  }

  @Get()
  @ApiInstallationFilter()
  @ApiEndpoint({
    summary: 'Listar setores',
    response: 'Sector',
    array: true,
    errors: [400],
    description:
      'Lista sem paginação, ordenada por nome e ID. Aceita somente o filtro installationId.',
  })
  findAll(
    @Session() session: UserSession,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sectorsService.findAll(session.user.id, query);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Consultar setor',
    response: 'Sector',
    id: 'uuid',
    errors: [400, 404],
  })
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sectorsService.findOne(session.user.id, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Atualizar setor',
    access: 'manage',
    body: 'UpdateSector',
    response: 'Sector',
    id: 'uuid',
    errors: [400, 404, 409],
  })
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSectorDto: UpdateSectorDto,
  ) {
    return this.sectorsService.update(session.user.id, id, updateSectorDto);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Excluir setor definitivamente',
    access: 'manage',
    response: 'Deleted',
    id: 'uuid',
    errors: [400, 404],
    description:
      'Exclui em cascata os dispositivos, chaves e telemetrias deste setor.',
  })
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sectorsService.remove(session.user.id, id);
  }
}
