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

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  create(
    @Session() session: UserSession,
    @Body() createDeviceDto: CreateDeviceDto,
  ) {
    return this.devicesService.create(session.user.id, createDeviceDto);
  }

  @Get()
  findAll(
    @Session() session: UserSession,
    @Query() query: Record<string, unknown>,
  ) {
    return this.devicesService.findAll(session.user.id, query);
  }

  @Get(':id')
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.findOne(session.user.id, id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDeviceDto: UpdateDeviceDto,
  ) {
    return this.devicesService.update(session.user.id, id, updateDeviceDto);
  }

  @Delete(':id')
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.devicesService.remove(session.user.id, id);
  }
}
