import { Test, TestingModule } from '@nestjs/testing';
import { InstallationsService } from './installations.service.js';
import { DATABASE_CONNECTION } from '../database/database-connection.js';

describe('InstallationsService', () => {
  let service: InstallationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationsService,
        { provide: DATABASE_CONNECTION, useValue: {} },
      ],
    }).compile();

    service = module.get<InstallationsService>(InstallationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
