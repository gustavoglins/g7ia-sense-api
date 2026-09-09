import { BadRequestException } from '@nestjs/common';
import { inputObject, optionalText, requiredText } from '../../common/input.js';

export const installationFields = [
  'name',
  'description',
  'zipcode',
  'country',
  'state',
  'city',
  'district',
  'street',
  'number',
  'complement',
  'latitude',
  'longitude',
  'status',
  'notes',
];

export class CreateInstallationDto {
  companyId?: string;
  name: string;
  description?: string | null;
  zipcode: string;
  country: string;
  state: string;
  city: string;
  district: string;
  street: string;
  number: string;
  complement?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: 'active' | 'inactive';
  notes?: string | null;

  static parse(value: unknown) {
    const input = inputObject(value);
    const status = input.status ?? 'active';
    if (status !== 'active' && status !== 'inactive')
      throw new BadRequestException('status deve ser active ou inactive.');
    function coordinate(key: string, max: number) {
      const value = input[key];
      if (value === undefined || value === null) return null;
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.abs(value) > max
      )
        throw new BadRequestException(
          `${key} deve estar entre -${max} e ${max}.`,
        );
      return value;
    }
    return {
      name: requiredText(input, 'name'),
      description: optionalText(input, 'description') ?? null,
      zipcode: requiredText(input, 'zipcode', 100),
      country: requiredText(input, 'country', 100),
      state: requiredText(input, 'state', 100),
      city: requiredText(input, 'city', 100),
      district: requiredText(input, 'district', 100),
      street: requiredText(input, 'street'),
      number: requiredText(input, 'number', 20),
      complement: optionalText(input, 'complement') ?? null,
      latitude: coordinate('latitude', 90),
      longitude: coordinate('longitude', 180),
      status,
      notes: optionalText(input, 'notes', 10000) ?? null,
    } satisfies Omit<CreateInstallationDto, 'companyId'>;
  }
}
