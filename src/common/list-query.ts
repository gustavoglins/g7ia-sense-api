import { BadRequestException } from '@nestjs/common';
import { inputObject } from './input.js';

export function listQuery(value: unknown, allowed: string[]) {
  const query = inputObject(value);
  if (Object.keys(query).some((key) => !allowed.includes(key))) {
    throw new BadRequestException('Filtro não permitido.');
  }
  return query;
}

export function optionalUuid(query: Record<string, unknown>, key: string) {
  const value = query[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(key + ' deve ser um UUID.');
  }
  return value;
}

export function positiveInteger(
  query: Record<string, unknown>,
  key: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const value = query[key];
  if (value === undefined) return fallback;
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > maximum
  ) {
    throw new BadRequestException(
      key + ' deve ser um inteiro positivo até ' + maximum + '.',
    );
  }
  return Number(value);
}
