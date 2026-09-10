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

@Controller('sectors')
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Post()
  create(
    @Session() session: UserSession,
    @Body() createSectorDto: CreateSectorDto,
  ) {
    return this.sectorsService.create(session.user.id, createSectorDto);
  }

  @Get()
  findAll(
    @Session() session: UserSession,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sectorsService.findAll(session.user.id, query);
  }

  @Get(':id')
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sectorsService.findOne(session.user.id, id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSectorDto: UpdateSectorDto,
  ) {
    return this.sectorsService.update(session.user.id, id, updateSectorDto);
  }

  @Delete(':id')
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sectorsService.remove(session.user.id, id);
  }
}
