import { Module } from '@nestjs/common';
import { SectorsService } from './sectors.service.js';
import { SectorsController } from './sectors.controller.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [SectorsController],
  providers: [SectorsService],
})
export class SectorsModule {}
