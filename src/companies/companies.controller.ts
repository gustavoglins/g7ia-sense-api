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

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(
    @Session() session: UserSession,
    @Body() createCompanyDto: CreateCompanyDto,
  ) {
    return this.companiesService.create(session.user.id, createCompanyDto);
  }

  @Get()
  findAll(@Session() session: UserSession) {
    return this.companiesService.findAll(session.user.id);
  }

  @Get(':id')
  findOne(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.findOne(session.user.id, id);
  }

  @Patch(':id')
  update(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.companiesService.update(session.user.id, id, body);
  }

  @Delete(':id')
  remove(
    @Session() session: UserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.remove(session.user.id, id);
  }
}
