import { BadRequestException } from '@nestjs/common';
import { inputObject, optionalText, requiredText } from '../../common/input.js';
import { devicesTypes } from '../devices.schema.js';

export const deviceFields = [
  'name',
  'devicesType',
  'serialNumber',
  'version',
  'macAddress',
  'status',
];

export class CreateDeviceDto {
  sectorId: string;
  name: string;
  devicesType: (typeof devicesTypes.enumValues)[number];
  serialNumber?: string | null;
  version?: string | null;
  macAddress?: string | null;
  status: 'active' | 'inactive';

  static parse(value: unknown) {
    const input = inputObject(value);
    const devicesType = input.devicesType;
    if (
      !devicesTypes.enumValues.includes(
        devicesType as CreateDeviceDto['devicesType'],
      )
    ) {
      throw new BadRequestException(
        'devicesType é obrigatório e deve ser ac, dc, env, act ou adv.',
      );
    }
    const status = input.status ?? 'active';
    if (status !== 'active' && status !== 'inactive')
      throw new BadRequestException('status deve ser active ou inactive.');
    return {
      name: requiredText(input, 'name'),
      devicesType: devicesType as CreateDeviceDto['devicesType'],
      serialNumber: optionalText(input, 'serialNumber') ?? null,
      version: optionalText(input, 'version') ?? null,
      macAddress: optionalText(input, 'macAddress') ?? null,
      status,
    } satisfies Omit<CreateDeviceDto, 'sectorId'>;
  }
}
