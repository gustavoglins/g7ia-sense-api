import { Test, TestingModule } from '@nestjs/testing';
import { SectorsController } from '../sectors.controller.js';
import { SectorsService } from '../sectors.service.js';

describe('SectorsController', () => {
  let controller: SectorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SectorsController],
      providers: [{ provide: SectorsService, useValue: {} }],
    }).compile();

    controller = module.get<SectorsController>(SectorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
