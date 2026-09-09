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

@Controller('installations')
export class InstallationsController {
  constructor(private readonly installationsService: InstallationsService) {}

  @Post()
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
  findAll(@Session() session: UserSession) {
    return this.installationsService.findAll(session.user.id);
  }

  @Get(':id')
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.installationsService.findOne(session.user.id, id);
  }

  @Patch(':id')
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
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.installationsService.remove(session.user.id, id);
  }
}
