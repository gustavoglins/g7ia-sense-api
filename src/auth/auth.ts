import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { authOptions } from './auth-options.js';

export const auth = betterAuth({
  ...authOptions,
  // baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(
    {},
    {
      provider: 'pg',
    },
  ),

  trustedOrigins: [
    'http://localhost:3001',
    'http://localhost:8081',
    'g7iv2mobile://',
    'exp://192.168.0.136:8081',
  ],
});
