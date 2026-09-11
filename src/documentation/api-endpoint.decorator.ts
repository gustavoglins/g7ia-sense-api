import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { ref, telemetryExamples } from './schemas.js';

export const SESSION_AUTH = 'session';
export const WRITE_API_KEY = 'deviceWriteKey';

type EndpointOptions = {
  summary: string;
  description?: string;
  response: string | SchemaObject;
  body?: string;
  status?: number;
  array?: boolean;
  access?: 'read' | 'manage' | 'super_admin' | 'public' | 'write';
  id?: 'uuid' | 'string';
  errors?: number[];
};

const permissions = {
  read: 'super_admin consulta todas as empresas. admin e user consultam somente a própria empresa.',
  manage:
    'Requer admin da empresa do recurso ou super_admin. user não pode alterar dados.',
  super_admin: 'Operação exclusiva de super_admin.',
  public: 'Não exige sessão.',
  write:
    'Não exige sessão/login. Envie apenas a chave WRITE do dispositivo no header x-api-key. Uma chave READ não autoriza esta operação.',
};

const errors: Record<number, string> = {
  400: 'Corpo, identificador ou parâmetros inválidos.',
  401: 'Sessão ausente/expirada ou chave WRITE ausente/inválida.',
  403: 'Sem permissão para esta operação/empresa ou dispositivo inativo.',
  404: 'Recurso não encontrado.',
  409: 'Conflito de unicidade ou operação incompatível com as regras do recurso.',
};

// Documentation metadata only; authorization remains in the guards/services.
export function ApiEndpoint(options: EndpointOptions) {
  const access = options.access ?? 'read';
  const response =
    typeof options.response === 'string'
      ? ref(options.response)
      : options.response;
  const decorators = [
    ApiOperation({
      summary: options.summary,
      description: [options.description, permissions[access]]
        .filter(Boolean)
        .join('\n\n'),
    }),
    ApiResponse({
      status: options.status ?? 200,
      description: 'Operação realizada com sucesso.',
      schema: options.array ? { type: 'array', items: response } : response,
    }),
  ];
  if (access !== 'public')
    decorators.push(
      ApiSecurity(access === 'write' ? WRITE_API_KEY : SESSION_AUTH),
    );
  if (options.body)
    decorators.push(
      ApiBody({
        required: true,
        schema: ref(options.body),
        ...(options.body === 'CreateTelemetry' && {
          examples: telemetryExamples,
        }),
      }),
    );
  if (options.id)
    decorators.push(
      ApiParam({
        name: 'id',
        required: true,
        description: 'Identificador do recurso.',
        schema: {
          type: 'string',
          ...(options.id === 'uuid' && { format: 'uuid' }),
        },
      }),
    );
  const statusCodes = new Set([
    ...(access === 'public' ? [] : [401, 403]),
    ...(options.errors ?? []),
  ]);
  for (const status of statusCodes)
    decorators.push(
      ApiResponse({
        status,
        description: errors[status],
        schema: ref('Error'),
      }),
    );
  return applyDecorators(...decorators);
}

export const ApiInstallationFilter = () =>
  ApiQuery({
    name: 'installationId',
    required: false,
    description: 'Filtra pela instalação, respeitando o escopo da sessão.',
    schema: { type: 'string', format: 'uuid' },
  });

export function ApiDeviceFilters() {
  return applyDecorators(
    ApiInstallationFilter(),
    ApiQuery({
      name: 'sectorId',
      required: false,
      description:
        'Filtra pelo setor. Com installationId, os dois filtros são combinados.',
      schema: { type: 'string', format: 'uuid' },
    }),
    ApiQuery({
      name: 'companyId',
      required: false,
      description:
        'super_admin pode selecionar qualquer empresa. admin/user só podem informar a própria empresa.',
      schema: { type: 'string', format: 'uuid' },
    }),
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, default: 1 },
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
  );
}
