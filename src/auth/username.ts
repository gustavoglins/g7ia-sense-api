import { BadRequestException } from '@nestjs/common';

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function companyUsernameSuffix(legalName: string): string {
  const suffix = legalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!suffix || suffix.length > 100) {
    throw new BadRequestException(
      'A razão social deve gerar um identificador de empresa entre 1 e 100 caracteres.',
    );
  }
  return suffix;
}

export function isValidUsername(value: string): boolean {
  return (
    value.length <= 255 &&
    /^(admin|[a-z0-9]+\+[a-z0-9]+)@[a-z0-9]{1,100}$/.test(value)
  );
}
