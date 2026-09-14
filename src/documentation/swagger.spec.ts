import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthGuard, AuthModule } from '@thallesp/nestjs-better-auth';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { hashPassword } from 'better-auth/crypto';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger';
import { authOptions } from '../auth/auth-options.js';
import { CompaniesController } from '../companies/companies.controller.js';
import { CompaniesService } from '../companies/companies.service.js';
import { CreateCompanyDto } from '../companies/dto/create-company.dto.js';
import { UsersController } from '../users/users.controller.js';
import { UsersService } from '../users/users.service.js';
import { InstallationsController } from '../installations/installations.controller.js';
import { InstallationsService } from '../installations/installations.service.js';
import { CreateInstallationDto } from '../installations/dto/create-installation.dto.js';
import { SectorsController } from '../sectors/sectors.controller.js';
import { SectorsService } from '../sectors/sectors.service.js';
import { CreateSectorDto } from '../sectors/dto/create-sector.dto.js';
import { DevicesController } from '../devices/devices.controller.js';
import { DevicesService } from '../devices/devices.service.js';
import { CreateDeviceDto } from '../devices/dto/create-device.dto.js';
import { TelemetryController } from '../telemetry/telemetry.controller.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { apiSchemas, telemetryExamples } from './schemas.js';
import { setupSwagger } from './swagger.js';

describe('Swagger documentation', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const username = 'admin@acmeltda';
  const password = 'documentation-test-password';

  beforeAll(async () => {
    const now = new Date();
    const auth = betterAuth({
      ...authOptions,
      baseURL: 'http://localhost:3000',
      secret: 'swagger-test-only-0123456789-abcdefghijklmnopqrstuvwxyz',
      database: memoryAdapter({
        user: [
          {
            id: 'admin-id',
            name: 'Admin',
            username,
            email: 'admin@users.invalid',
            emailVerified: false,
            companyId: '7a1f1111-2222-4333-8444-555555555555',
            role: 'admin',
            createdAt: now,
            updatedAt: now,
          },
        ],
        account: [
          {
            id: 'credential-id',
            accountId: 'admin-id',
            userId: 'admin-id',
            providerId: 'credential',
            password: await hashPassword(password),
            createdAt: now,
            updatedAt: now,
          },
        ],
        session: [],
        verification: [],
      }),
    });
    const module = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ auth })],
      controllers: [
        CompaniesController,
        UsersController,
        InstallationsController,
        SectorsController,
        DevicesController,
        TelemetryController,
      ],
      providers: [
        ...[
          CompaniesService,
          UsersService,
          InstallationsService,
          SectorsService,
          DevicesService,
          TelemetryService,
        ].map((provide) => ({ provide, useValue: {} })),
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    await setupSwagger(app);
    await app.init();
    document = (
      await request(app.getHttpServer()).get('/api/docs-json').expect(200)
    ).body;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves Swagger UI, assets, JSON and YAML without requiring a session', async () => {
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect(/swagger-ui/);
    await request(app.getHttpServer())
      .get('/api/docs/swagger-ui-init.js')
      .expect(200)
      .expect(/withCredentials/);
    await request(app.getHttpServer())
      .get('/api/docs-yaml')
      .expect(200)
      .expect(/openapi: 3.0.3/);
    expect(document.openapi).toBe('3.0.3');
    expect(document.servers).toContainEqual({
      url: '/',
      description: 'Mesma origem da API',
    });
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('documents every application operation with a response and correct authentication', () => {
    const operations: [string, string, OperationObject][] = [];
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of ['get', 'post', 'patch', 'delete'] as const) {
        if (item[method]) operations.push([path, method, item[method]]);
      }
    }
    expect(operations).toHaveLength(32);
    const ids = new Set<string>();
    for (const [path, method, operation] of operations) {
      expect(path).toMatch(/^\/api\//);
      expect(operation.summary).toBeTruthy();
      expect(operation.tags?.length).toBe(1);
      expect(operation.operationId).toBeTruthy();
      expect(ids.has(operation.operationId!)).toBe(false);
      ids.add(operation.operationId!);
      const success =
        method === 'post' && !path.startsWith('/api/auth/') ? '201' : '200';
      expect(
        (operation.responses[success] as ResponseObject).content?.[
          'application/json'
        ].schema,
      ).toBeDefined();
      if (path === '/api/telemetry')
        expect(operation.security).toEqual([{ deviceWriteKey: [] }]);
      else if (path === '/api/users/public')
        expect(operation.security ?? []).toEqual([]);
      else if (!path.startsWith('/api/auth/'))
        expect(operation.security).toEqual([{ session: [] }]);
    }
    expect(document.paths['/api/auth/sign-in/email']).toBeUndefined();
    expect(document.paths['/api/auth/sign-up/email']).toBeUndefined();
    expect(document.paths['/api/auth/update-user']).toBeUndefined();
  });

  it('resolves every schema reference and declares the actual cookie and WRITE header', () => {
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value) {
        expect(value.$ref).toMatch(/^#\/components\/schemas\//);
        expect(
          document.components?.schemas?.[String(value.$ref).split('/').at(-1)!],
        ).toBeDefined();
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(document);
    expect(document.components?.securitySchemes).toEqual({
      session: expect.objectContaining({
        type: 'apiKey',
        in: 'cookie',
        name: 'better-auth.session_token',
      }),
      deviceWriteKey: expect.objectContaining({
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      }),
    });
  });

  it('documents filters, pagination and the different device read/write responses', () => {
    const parameters = document.paths['/api/devices'].get!
      .parameters as ParameterObject[];
    expect(parameters.map((parameter) => parameter.name).sort()).toEqual([
      'companyId',
      'installationId',
      'limit',
      'page',
      'sectorId',
    ]);
    expect(
      parameters.find((parameter) => parameter.name === 'limit')?.schema,
    ).toMatchObject({ default: 20, maximum: 100 });
    expect(
      (document.paths['/api/devices'].get!.responses['200'] as ResponseObject)
        .content?.['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/DevicePage' });
    expect(
      (document.paths['/api/devices'].post!.responses['201'] as ResponseObject)
        .content?.['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/Device' });
    expect(apiSchemas.DeviceDetails.required).toEqual(
      expect.arrayContaining([
        'sector',
        'installation',
        'latestTelemetry',
        'apiKeys',
      ]),
    );
    expect(apiSchemas.Device.properties).not.toHaveProperty('latestTelemetry');
    expect(apiSchemas.UpdateDevice.properties).not.toHaveProperty('sectorId');
    expect(apiSchemas.UpdateDevice.properties).not.toHaveProperty('apiKeys');
    expect(apiSchemas.UpdateCompany.properties).not.toHaveProperty(
      'adminPassword',
    );
    expect(apiSchemas.UpdateCompany.required).toBeUndefined();
  });

  it('documents installation metrics, the date range and session requirement', () => {
    const operation = document.paths['/api/installations/{id}/metrics'].get!;
    expect(operation.security).toEqual([{ session: [] }]);
    expect(
      (operation.parameters as ParameterObject[])
        .map((parameter) => parameter.name)
        .sort(),
    ).toEqual(['from', 'id', 'to']);
    expect(
      (operation.responses['200'] as ResponseObject).content?.[
        'application/json'
      ].schema,
    ).toEqual({ $ref: '#/components/schemas/InstallationMetrics' });
    expect(apiSchemas.EnergyConsumed.properties?.value).toMatchObject({
      type: 'number',
      nullable: true,
    });
  });

  it('produces a valid OpenAPI document for tooling and client generation', async () => {
    // Validation dereferences/mutates its input; preserve the source document.
    await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
  });

  it('provides create examples compatible with the current input parsers', () => {
    const example = (schema: SchemaObject) =>
      Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [
          key,
          (value as SchemaObject).example,
        ]),
      );
    const company = example(apiSchemas.CreateCompany);
    company.adminPassword = password;
    expect(() => CreateCompanyDto.parse(company)).not.toThrow();
    expect(() =>
      CreateInstallationDto.parse(example(apiSchemas.CreateInstallation)),
    ).not.toThrow();
    expect(() =>
      CreateSectorDto.parse(example(apiSchemas.CreateSector)),
    ).not.toThrow();
    expect(() =>
      CreateDeviceDto.parse(example(apiSchemas.CreateDevice)),
    ).not.toThrow();
    expect(apiSchemas.CreateDevice.required).toEqual([
      'sectorId',
      'name',
      'deviceType',
    ]);
  });

  it('telemetry examples match the actual parser and do not require deviceId or a session', async () => {
    const values = vi.fn();
    const telemetry = new TelemetryService({
      insert: () => ({
        values: (input: unknown) => {
          values(input);
          return { returning: async () => [input] };
        },
      }),
    } as never);
    const body = document.paths['/api/telemetry'].post!
      .requestBody as RequestBodyObject;
    expect(body.content['application/json'].examples).toEqual(
      telemetryExamples,
    );
    expect(apiSchemas.CreateTelemetry.anyOf).toHaveLength(3);
    for (const deviceType of ['ac', 'dc', 'env'] as const) {
      const device = { id: 'device-id', deviceType } as Parameters<
        TelemetryService['create']
      >[0];
      await telemetry.create(device, telemetryExamples[deviceType].value);
      await telemetry.create(device, { time: '2026-09-11T12:30:00-03:00' });
      expect(values).toHaveBeenLastCalledWith(
        expect.objectContaining({
          deviceId: 'device-id',
          time: expect.any(Date),
          rssi: null,
        }),
      );
    }
  });

  it('supports the documented login, cookie session and logout flow on the same origin', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get('/api/auth/get-session').expect(200, 'null');
    const login = await agent
      .post('/api/auth/sign-in/username')
      .set('Origin', 'http://localhost:3000')
      .send({ username, password })
      .expect(200);
    expect(login.body.user.username).toBe(username);
    await agent.get('/api/installations/not-a-uuid/metrics').expect(400);
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('better-auth.session_token='),
      ]),
    );
    const session = await agent.get('/api/auth/get-session').expect(200);
    expect(session.body.user.username).toBe(username);
    await agent
      .post('/api/auth/sign-out')
      .set('Origin', 'http://localhost:3000')
      .send({})
      .expect(200, { success: true });
    await agent.get('/api/auth/get-session').expect(200, 'null');
  });
});
