import { Test, TestingModule } from '@nestjs/testing';
import { InstallationsController } from '../installations.controller.js';
import { InstallationsService } from '../installations.service.js';

describe('InstallationsController', () => {
  let controller: InstallationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstallationsController],
      providers: [{ provide: InstallationsService, useValue: {} }],
    }).compile();

    controller = module.get<InstallationsController>(InstallationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
