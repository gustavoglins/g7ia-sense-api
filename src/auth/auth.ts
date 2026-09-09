import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export const auth = betterAuth({
  // baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(
    {},
    {
      provider: 'pg',
    },
  ),
});
