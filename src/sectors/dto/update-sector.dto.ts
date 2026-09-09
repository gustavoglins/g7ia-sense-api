import { PartialType } from '@nestjs/mapped-types';
import { CreateSectorDto } from './create-sector.dto.js';

export class UpdateSectorDto extends PartialType(CreateSectorDto) {}
