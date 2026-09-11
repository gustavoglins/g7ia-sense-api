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
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../documentation/api-endpoint.decorator.js';

@ApiTags('Empresas')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Criar empresa e administrador automático',
    access: 'super_admin',
    body: 'CreateCompany',
    response: 'CompanyCreated',
    status: 201,
    errors: [400, 409],
    description:
      'Cria empresa, usuário admin@empresa com role admin e credencial em uma transação. usernameSuffix deriva de legalName.',
  })
  create(
    @Session() session: UserSession,
    @Body() createCompanyDto: CreateCompanyDto,
  ) {
    return this.companiesService.create(session.user.id, createCompanyDto);
  }

  @Get()
  @ApiEndpoint({ summary: 'Listar empresas', response: 'Company', array: true })
  findAll(@Session() session: UserSession) {
    return this.companiesService.findAll(session.user.id);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Consultar empresa',
    response: 'Company',
    id: 'uuid',
    errors: [400, 404],
  })
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.findOne(session.user.id, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Atualizar empresa',
    access: 'manage',
    body: 'UpdateCompany',
    response: 'Company',
    id: 'uuid',
    errors: [400, 404, 409],
    description: 'Alterar legalName não muda o sufixo de login dos usuários.',
  })
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.companiesService.update(session.user.id, id, body);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Excluir empresa definitivamente',
    access: 'manage',
    response: 'Deleted',
    id: 'uuid',
    errors: [400, 404],
    description:
      'Exclui usuários, sessões, credenciais, instalações, setores, dispositivos, chaves e telemetrias vinculados. Se houver super_admin na empresa, somente super_admin pode excluí-la.',
  })
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.remove(session.user.id, id);
  }
}
