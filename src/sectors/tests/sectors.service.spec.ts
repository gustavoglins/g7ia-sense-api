import { Test, TestingModule } from '@nestjs/testing';
import { SectorsService } from '../sectors.service.js';
import { DATABASE_CONNECTION } from '../../database/database-connection.js';

describe('SectorsService', () => {
  let service: SectorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectorsService,
        { provide: DATABASE_CONNECTION, useValue: {} },
      ],
    }).compile();

    service = module.get<SectorsService>(SectorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
