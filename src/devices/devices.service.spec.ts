import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service.js';
import { DATABASE_CONNECTION } from '../database/database-connection.js';

describe('DevicesService', () => {
  let service: DevicesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: DATABASE_CONNECTION, useValue: {} },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
