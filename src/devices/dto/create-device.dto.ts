import { BadRequestException } from '@nestjs/common';
import { inputObject, optionalText, requiredText } from '../../common/input.js';
import { deviceTypes } from '../devices.schema.js';

export const deviceFields = [
  'name',
  'deviceType',
  'serialNumber',
  'version',
  'macAddress',
  'status',
];

export class CreateDeviceDto {
  sectorId: string;
  name: string;
  deviceType: (typeof deviceTypes.enumValues)[number];
  serialNumber?: string | null;
  version?: string | null;
  macAddress?: string | null;
  status: 'active' | 'inactive';

  static parse(value: unknown) {
    const input = inputObject(value);
    const deviceType = input.deviceType;
    if (
      !deviceTypes.enumValues.includes(
        deviceType as CreateDeviceDto['deviceType'],
      )
    ) {
      throw new BadRequestException(
        'deviceType é obrigatório e deve ser ac, dc, env, act ou adv.',
      );
    }
    const status = input.status ?? 'active';
    if (status !== 'active' && status !== 'inactive')
      throw new BadRequestException('status deve ser active ou inactive.');
    return {
      name: requiredText(input, 'name'),
      deviceType: deviceType as CreateDeviceDto['deviceType'],
      serialNumber: optionalText(input, 'serialNumber') ?? null,
      version: optionalText(input, 'version') ?? null,
      macAddress: optionalText(input, 'macAddress') ?? null,
      status,
    } satisfies Omit<CreateDeviceDto, 'sectorId'>;
  }
}
