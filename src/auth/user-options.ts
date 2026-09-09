// Shared by the NestJS runtime and the Better Auth CLI configuration.
export const userOptions = {
  additionalFields: {
    role: {
      type: ['super_admin', 'admin', 'user'] as [
        'super_admin',
        'admin',
        'user',
      ],
      required: true,
      defaultValue: 'user',
      input: false,
    },
    companyId: {
      type: 'string',
      required: true,
      input: false,
    },
  },
} as const;
