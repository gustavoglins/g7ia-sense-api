import { BadRequestException } from '@nestjs/common';
import { inputObject, optionalText, requiredText } from '../../common/input.js';

export class CreateSectorDto {
  installationId: string;
  name: string;
  description?: string | null;
  status: 'active' | 'inactive';

  static parse(value: unknown) {
    const input = inputObject(value);
    const status = input.status ?? 'active';
    if (status !== 'active' && status !== 'inactive')
      throw new BadRequestException('status deve ser active ou inactive.');
    return {
      name: requiredText(input, 'name'),
      description: optionalText(input, 'description') ?? null,
      status,
    } satisfies Omit<CreateSectorDto, 'installationId'>;
  }
}
