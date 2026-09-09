import { Module } from '@nestjs/common';
import { InstallationsService } from './installations.service.js';
import { InstallationsController } from './installations.controller.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [InstallationsController],
  providers: [InstallationsService],
})
export class InstallationsModule {}
