import { BadRequestException } from '@nestjs/common';

export function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Envie um objeto JSON.');
  }
  return value as Record<string, unknown>;
}

export function requiredText(
  input: Record<string, unknown>,
  key: string,
  max = 255,
): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(
      `${key} deve conter entre 1 e ${max} caracteres.`,
    );
  }
  return value.trim();
}

export function optionalText(
  input: Record<string, unknown>,
  key: string,
  max = 255,
): string | undefined {
  return input[key] === undefined || input[key] === null
    ? undefined
    : requiredText(input, key, max);
}

export function credentialPassword(
  input: Record<string, unknown>,
  key = 'password',
): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new BadRequestException(
      `${key} deve conter entre 8 e 128 caracteres.`,
    );
  }
  return value;
}
