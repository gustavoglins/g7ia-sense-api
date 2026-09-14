import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';
import { roles } from '../auth/roles.js';
import { deviceTypes } from '../devices/devices.schema.js';

export const ref = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

const object = (
  properties: Record<string, SchemaObject | ReferenceObject>,
  required = Object.keys(properties),
  options: Partial<SchemaObject> = {},
): SchemaObject => ({
  type: 'object',
  properties,
  ...(required.length > 0 && { required }),
  additionalProperties: false,
  ...options,
});
const text = (example: string, maxLength = 255): SchemaObject => ({
  type: 'string',
  minLength: 1,
  maxLength,
  example,
});
const optionalText = (example: string, maxLength = 255): SchemaObject => ({
  ...text(example, maxLength),
  nullable: true,
});
const uuid: SchemaObject = {
  type: 'string',
  format: 'uuid',
  example: '7a1f1111-2222-4333-8444-555555555555',
};
const dateTime: SchemaObject = {
  type: 'string',
  format: 'date-time',
  example: '2026-09-11T15:30:00.000Z',
};
const status: SchemaObject = {
  type: 'string',
  enum: ['active', 'inactive'],
  example: 'active',
};
const role: SchemaObject = {
  type: 'string',
  enum: [...roles],
  example: 'user',
};
const password: SchemaObject = {
  type: 'string',
  format: 'password',
  minLength: 8,
  maxLength: 128,
  writeOnly: true,
  example: 'substitua-esta-senha',
};
const timestamps = { createdAt: dateTime, updatedAt: dateTime };
const username: SchemaObject = {
  type: 'string',
  maxLength: 255,
  pattern: '^(admin|[a-z0-9]+\\+[a-z0-9]+)@[a-z0-9]{1,100}$',
  example: 'ana+silva@acmeltda',
};
const address = {
  zipcode: text('01001000', 100),
  country: text('Brasil', 100),
  state: text('SP', 100),
  city: text('São Paulo', 100),
  district: text('Centro', 100),
  street: text('Rua Exemplo'),
  number: text('100', 20),
  complement: optionalText('Sala 1'),
};
const requiredAddress = [
  'zipcode',
  'country',
  'state',
  'city',
  'district',
  'street',
  'number',
];
const companyFields = {
  name: text('Acme'),
  legalName: text('Acme Ltda'),
  taxId: text('12345678000190'),
  email: { ...optionalText('contato@acme.example'), format: 'email' },
  phone: optionalText('11999999999', 30),
  website: optionalText('https://acme.example'),
  ...address,
  status,
  notes: optionalText('Empresa de exemplo', 10000),
};
const installationFields = {
  name: text('Matriz'),
  description: optionalText('Instalação principal'),
  ...address,
  latitude: {
    type: 'number',
    nullable: true,
    minimum: -90,
    maximum: 90,
    example: -23.55,
  } as SchemaObject,
  longitude: {
    type: 'number',
    nullable: true,
    minimum: -180,
    maximum: 180,
    example: -46.63,
  } as SchemaObject,
  status,
  notes: optionalText('Instalação de exemplo', 10000),
};
const sectorFields = {
  name: text('Sala de máquinas'),
  description: optionalText('Setor principal'),
  status,
};
const deviceFields = {
  name: text('Medidor AC 01'),
  deviceType: {
    type: 'string',
    enum: [...deviceTypes.enumValues],
    example: 'ac',
  } as SchemaObject,
  serialNumber: optionalText('AC-001'),
  version: optionalText('1.0'),
  macAddress: optionalText('AA:BB:CC:DD:EE:FF'),
  status,
};
const deviceRecord = {
  id: uuid,
  sectorId: uuid,
  ...deviceFields,
  ...timestamps,
  apiKeys: ref('DeviceApiKeys'),
};
const publicUserFields = {
  id: { type: 'string', example: uuid.example } as SchemaObject,
  name: text('Ana Silva'),
  username,
  companyId: uuid,
  role,
};
const measurement = (example: string): SchemaObject => ({
  type: 'string',
  nullable: true,
  example,
  description:
    'Valor enviado pelo dispositivo como string. Omitido ou null é armazenado como null.',
});
const telemetryTime = {
  ...dateTime,
  description:
    'Momento da leitura no dispositivo. ISO 8601 com Z ou offset obrigatório; até 3 casas de milissegundos.',
};
const ac = {
  v1: measurement('220.5'),
  a1: measurement('3.2'),
  fp1: measurement('0.98'),
  rssi: measurement('-65'),
};
const dc = {
  vdc1: measurement('12.1'),
  cc1: measurement('1.2'),
  vdc2: measurement('24.2'),
  cc2: measurement('2.3'),
  vdc3: measurement('48.3'),
  cc3: measurement('3.4'),
  rssi: measurement('-66'),
};
const env = {
  temp: measurement('25.3'),
  humidity: measurement('61'),
  solar: measurement('500'),
  light: measurement('1000'),
  wind: measurement('4.2'),
  h2: measurement('0.8'),
  rssi: measurement('-67'),
};
const telemetryRecord = {
  id: uuid,
  time: telemetryTime,
  deviceId: uuid,
  createdAt: {
    ...dateTime,
    description: 'Momento em que a API armazenou o registro.',
  },
};

export const telemetryExamples = {
  ac: {
    summary: 'Dispositivo AC',
    value: {
      time: dateTime.example,
      v1: '220.5',
      a1: '3.2',
      fp1: '0.98',
      rssi: '-65',
    },
  },
  dc: {
    summary: 'Dispositivo DC',
    value: {
      time: dateTime.example,
      vdc1: '12.1',
      cc1: '1.2',
      vdc2: '24.2',
      cc2: '2.3',
      vdc3: '48.3',
      cc3: '3.4',
      rssi: '-66',
    },
  },
  env: {
    summary: 'Dispositivo ENV',
    value: {
      time: dateTime.example,
      temp: '25.3',
      humidity: '61',
      solar: '500',
      light: '1000',
      wind: '4.2',
      h2: '0.8',
      rssi: '-67',
    },
  },
};

// Explicit wire schemas: Drizzle results, unknown request bodies and partial DTOs
// do not expose their complete JSON contracts through TypeScript reflection.
export const apiSchemas: Record<string, SchemaObject> = {
  Error: object(
    {
      statusCode: { type: 'integer', example: 400 },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      error: { type: 'string', example: 'Bad Request' },
    },
    ['statusCode', 'message'],
  ),
  AuthError: object({
    code: { type: 'string', example: 'INVALID_USERNAME_OR_PASSWORD' },
    message: { type: 'string', example: 'Invalid username or password' },
  }),
  Deleted: object({ id: uuid }),
  DeletedUser: object({ id: { type: 'string' } }),
  Company: object({
    id: uuid,
    ...companyFields,
    usernameSuffix: {
      ...text('acmeltda', 100),
      description:
        'Gerado de legalName na criação; não muda quando legalName é editado.',
    },
    ...timestamps,
  }),
  CreateCompany: object(
    {
      ...companyFields,
      status: { ...status, default: 'active' },
      adminPassword: password,
    },
    ['name', 'legalName', 'taxId', ...requiredAddress, 'adminPassword'],
  ),
  UpdateCompany: object(companyFields, [], {
    minProperties: 1,
    description:
      'Campos editáveis. usernameSuffix e adminPassword não podem ser alterados por esta rota. Campos opcionais com null são ignorados na atualização.',
  }),
  CompanyCreated: object({
    company: ref('Company'),
    admin: ref('CompanyAdmin'),
  }),
  CompanyAdmin: object({
    ...publicUserFields,
    username: { ...username, example: 'admin@acmeltda' },
    role: { ...role, enum: ['admin'], example: 'admin' },
  }),
  User: object({ ...publicUserFields, createdAt: dateTime }),
  CreateUser: object(
    {
      name: publicUserFields.name,
      username: {
        ...username,
        pattern: '^[a-z0-9]+\\+[a-z0-9]+@[a-z0-9]{1,100}$',
        description:
          'Use nome+sobrenome@empresa, com + literal e o usernameSuffix da empresa. admin@empresa é reservado ao sistema.',
      },
      password,
      role: {
        ...role,
        default: 'user',
        description: 'Somente super_admin pode atribuir super_admin.',
      },
      companyId: {
        ...uuid,
        description:
          'Omitido: empresa da sessão. Somente super_admin pode escolher outra empresa.',
      },
    },
    ['name', 'username', 'password'],
  ),
  UpdateUser: object({ name: publicUserFields.name, role, password }, [], {
    minProperties: 1,
    description:
      'Alterar role ou senha revoga as sessões. Username e empresa são imutáveis. O administrador automático não pode ser rebaixado para user.',
  }),
  InstallationMetrics: object({
    installationId: uuid,
    period: object({
      from: dateTime,
      to: dateTime,
      timeZone: {
        type: 'string',
        example: 'America/Sao_Paulo',
        description:
          'Fuso usado no período padrão de hoje. Datas retornadas em UTC.',
      },
    }),
    metrics: object({ energyConsumed: ref('EnergyConsumed') }),
  }),
  EnergyConsumed: object({
    value: {
      type: 'number',
      nullable: true,
      minimum: 0,
      example: 1.25,
      description:
        'Energia AC estimada, arredondada a 6 casas decimais. null significa ausência de leituras válidas; zero é consumo medido igual a zero.',
    },
    unit: { type: 'string', enum: ['kWh'] },
    estimated: { type: 'boolean', enum: [true] },
    samplingIntervalSeconds: { type: 'integer', enum: [15] },
    validSamples: { type: 'integer', minimum: 0, example: 240 },
    invalidSamples: {
      type: 'integer',
      minimum: 0,
      example: 0,
      description:
        'Leituras não duplicadas descartadas por valores ausentes, inválidos ou fora do intervalo permitido.',
    },
    duplicateSamples: {
      type: 'integer',
      minimum: 0,
      example: 0,
      description:
        'Reenvios com o mesmo deviceId/time descartados. Prevalece maior createdAt, depois maior id.',
    },
  }),
  Installation: object({
    id: uuid,
    companyId: uuid,
    ...installationFields,
    ...timestamps,
  }),
  CreateInstallation: object(
    {
      companyId: {
        ...uuid,
        description:
          'Omitido: empresa da sessão. Somente super_admin pode escolher outra empresa.',
      },
      ...installationFields,
      status: { ...status, default: 'active' },
    },
    ['name', ...requiredAddress],
  ),
  UpdateInstallation: object(installationFields, [], {
    minProperties: 1,
    description: 'A empresa da instalação não pode ser alterada.',
  }),
  Sector: object({
    id: uuid,
    installationId: uuid,
    ...sectorFields,
    ...timestamps,
  }),
  CreateSector: object(
    {
      installationId: uuid,
      ...sectorFields,
      status: { ...status, default: 'active' },
    },
    ['installationId', 'name'],
  ),
  UpdateSector: object(sectorFields, [], {
    minProperties: 1,
    description: 'A instalação do setor não pode ser alterada.',
  }),
  DeviceApiKeys: object({
    read: {
      type: 'string',
      example: 'read_chave_gerada_pela_api',
      description:
        'Gerada pela API. A autenticação por READ ainda não está implementada.',
    },
    write: {
      type: 'string',
      example: 'write_chave_gerada_pela_api',
      description:
        'Gerada pela API. Envie no header x-api-key para criar telemetria.',
    },
  }),
  CreateDevice: object(
    {
      sectorId: uuid,
      ...deviceFields,
      status: { ...status, default: 'active' },
    },
    ['sectorId', 'name', 'deviceType'],
  ),
  UpdateDevice: object(deviceFields, [], {
    minProperties: 1,
    description:
      'O setor e as chaves não podem ser alterados. deviceType recebe um único valor.',
  }),
  Device: object(deviceRecord),
  LocationSummary: object({ id: uuid, name: { type: 'string' } }),
  DeviceDetails: object({
    ...deviceRecord,
    sector: ref('LocationSummary'),
    installation: ref('LocationSummary'),
    latestTelemetry: {
      description:
        'Última leitura do tipo atual por time DESC, createdAt DESC e id DESC. null quando não há leituras ou o tipo é act/adv.',
      anyOf: [
        ref('TelemetryAc'),
        ref('TelemetryDc'),
        ref('TelemetryEnv'),
        { type: 'object', nullable: true, enum: [null] },
      ],
    },
  }),
  Pagination: object({
    page: { type: 'integer', minimum: 1, example: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, example: 20 },
    total: { type: 'integer', minimum: 0, example: 3 },
    totalPages: { type: 'integer', minimum: 0, example: 1 },
  }),
  DevicePage: object({
    data: { type: 'array', items: ref('DeviceDetails') },
    pagination: ref('Pagination'),
  }),
  CreateTelemetryAc: object({ time: telemetryTime, ...ac }, ['time']),
  CreateTelemetryDc: object({ time: telemetryTime, ...dc }, ['time']),
  CreateTelemetryEnv: object({ time: telemetryTime, ...env }, ['time']),
  // Measurements are optional, so time-only bodies match multiple types.
  CreateTelemetry: {
    anyOf: [
      ref('CreateTelemetryAc'),
      ref('CreateTelemetryDc'),
      ref('CreateTelemetryEnv'),
    ],
  },
  TelemetryAc: object({ ...telemetryRecord, ...ac }),
  TelemetryDc: object({ ...telemetryRecord, ...dc }),
  TelemetryEnv: object({ ...telemetryRecord, ...env }),
  Telemetry: {
    oneOf: [ref('TelemetryAc'), ref('TelemetryDc'), ref('TelemetryEnv')],
  },
  SignInUsername: object(
    {
      username: {
        type: 'string',
        maxLength: 255,
        example: 'admin@acmeltda',
        description:
          'admin@empresa ou nome+sobrenome@empresa. Normalizado para minúsculas.',
      },
      password: {
        type: 'string',
        format: 'password',
        writeOnly: true,
        example: 'substitua-esta-senha',
      },
      rememberMe: { type: 'boolean', default: true },
      callbackURL: {
        type: 'string',
        description:
          'URL de retorno opcional, sujeita às origens confiáveis do Better Auth.',
      },
    },
    ['username', 'password'],
  ),
  AuthUser: object(
    {
      ...publicUserFields,
      email: {
        type: 'string',
        format: 'email',
        description: 'Endereço interno do Better Auth. O login usa username.',
      },
      emailVerified: { type: 'boolean' },
      image: { type: 'string', nullable: true },
      ...timestamps,
    },
    [
      'id',
      'name',
      'username',
      'companyId',
      'role',
      'email',
      'emailVerified',
      'createdAt',
      'updatedAt',
    ],
  ),
  SignInResult: object(
    {
      redirect: { type: 'boolean', example: false },
      token: {
        type: 'string',
        description:
          'Token da sessão. O navegador utiliza o cookie assinado enviado em Set-Cookie.',
      },
      url: { type: 'string' },
      user: ref('AuthUser'),
    },
    ['redirect', 'token', 'user'],
  ),
  AuthSession: object(
    {
      id: { type: 'string' },
      userId: { type: 'string' },
      token: { type: 'string' },
      expiresAt: dateTime,
      ...timestamps,
      ipAddress: { type: 'string', nullable: true },
      userAgent: { type: 'string', nullable: true },
    },
    ['id', 'userId', 'token', 'expiresAt', 'createdAt', 'updatedAt'],
  ),
  SessionResult: {
    ...object({ session: ref('AuthSession'), user: ref('AuthUser') }),
    nullable: true,
    description: 'Retorna null quando não existe sessão válida.',
  },
  SignOutResult: object(
    {
      success: { type: 'boolean', example: true },
      url: { type: 'string' },
      redirect: { type: 'boolean' },
    },
    ['success'],
  ),
};
