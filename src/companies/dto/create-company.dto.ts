import { BadRequestException } from '@nestjs/common';
import {
  credentialPassword,
  inputObject,
  optionalText,
  requiredText,
} from '../../common/input.js';

export class CreateCompanyDto {
  name: string;
  legalName: string;
  taxId: string;
  email?: string;
  phone?: string;
  website?: string;
  zipcode: string;
  country: string;
  state: string;
  city: string;
  district: string;
  street: string;
  number: string;
  complement?: string;
  status: 'active' | 'inactive';
  notes?: string;
  adminPassword: string;

  static parse(value: unknown): CreateCompanyDto {
    const input = inputObject(value);
    const status = input.status ?? 'active';
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('status deve ser active ou inactive.');
    }
    const email = optionalText(input, 'email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('email inválido.');
    }
    return {
      name: requiredText(input, 'name'),
      legalName: requiredText(input, 'legalName'),
      taxId: requiredText(input, 'taxId'),
      email: email?.toLowerCase(),
      phone: optionalText(input, 'phone', 30),
      website: optionalText(input, 'website'),
      zipcode: requiredText(input, 'zipcode', 100),
      country: requiredText(input, 'country', 100),
      state: requiredText(input, 'state', 100),
      city: requiredText(input, 'city', 100),
      district: requiredText(input, 'district', 100),
      street: requiredText(input, 'street'),
      number: requiredText(input, 'number', 20),
      complement: optionalText(input, 'complement'),
      status,
      notes: optionalText(input, 'notes', 10000),
      adminPassword: credentialPassword(input, 'adminPassword'),
    };
  }
}
