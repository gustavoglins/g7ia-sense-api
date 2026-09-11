import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../documentation/api-endpoint.decorator.js';

@ApiTags('Usuários')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Criar usuário da empresa',
    access: 'manage',
    body: 'CreateUser',
    response: 'User',
    status: 201,
    errors: [400, 404, 409],
  })
  create(@Session() session: UserSession, @Body() body: unknown) {
    return this.usersService.create(session.user.id, body);
  }
  @Get('session')
  @ApiEndpoint({
    summary: 'Consultar usuário autenticado',
    response: 'User',
    errors: [404],
    description:
      'Retorna os dados públicos atuais do usuário da sessão, incluindo role e companyId.',
  })
  getSession(@Session() session: UserSession) {
    return this.usersService.findOne(session.user.id, session.user.id);
  }

  @Get('public')
  @AllowAnonymous()
  @ApiEndpoint({
    summary: 'Consultar rota pública',
    access: 'public',
    response: { type: 'boolean', example: true },
  })
  getPublic() {
    return true;
  }

  @Get()
  @ApiEndpoint({ summary: 'Listar usuários', response: 'User', array: true })
  findAll(@Session() session: UserSession) {
    return this.usersService.findAll(session.user.id);
  }

  @Get(':id')
  @ApiEndpoint({
    summary: 'Consultar usuário',
    response: 'User',
    id: 'string',
    errors: [404],
  })
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.usersService.findOne(session.user.id, id);
  }

  @Patch(':id')
  @ApiEndpoint({
    summary: 'Atualizar usuário, role ou senha',
    access: 'manage',
    body: 'UpdateUser',
    response: 'User',
    id: 'string',
    errors: [400, 404, 409],
    description:
      'Somente super_admin pode atribuir super_admin ou alterar um usuário super_admin. Alterações de role/senha revogam as sessões do usuário.',
  })
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.usersService.update(session.user.id, id, body);
  }

  @Delete(':id')
  @ApiEndpoint({
    summary: 'Excluir usuário definitivamente',
    access: 'manage',
    response: 'DeletedUser',
    id: 'string',
    errors: [404, 409],
    description:
      'Remove também sessões e credenciais. O administrador automático só pode ser excluído junto com a empresa. Somente super_admin pode excluir outro super_admin.',
  })
  remove(@Session() session: UserSession, @Param('id') id: string) {
    return this.usersService.remove(session.user.id, id);
  }
}
