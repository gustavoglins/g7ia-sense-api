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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Session() session: UserSession, @Body() body: unknown) {
    return this.usersService.create(session.user.id, body);
  }
  @Get('session')
  getSession(@Session() session: UserSession) {
    return this.usersService.findOne(session.user.id, session.user.id);
  }

  @Get('public')
  @AllowAnonymous()
  getPublic() {
    return true;
  }

  @Get()
  findAll(@Session() session: UserSession) {
    return this.usersService.findAll(session.user.id);
  }

  @Get(':id')
  findOne(@Session() session: UserSession, @Param('id') id: string) {
    return this.usersService.findOne(session.user.id, id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.usersService.update(session.user.id, id, body);
  }

  @Delete(':id')
  remove(@Session() session: UserSession, @Param('id') id: string) {
    return this.usersService.remove(session.user.id, id);
  }
}
