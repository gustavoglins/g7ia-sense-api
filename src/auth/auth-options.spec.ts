import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { hashPassword } from 'better-auth/crypto';
import { authOptions } from './auth-options.js';
import { companyUsernameSuffix, isValidUsername } from './username.js';

describe('username authentication', () => {
  const password = 'test-password-123';
  let auth: ReturnType<typeof betterAuth>;

  beforeAll(async () => {
    const now = new Date();
    auth = betterAuth({
      ...authOptions,
      secret: 'test-secret-only-0123456789-abcdefghijklmnopqrstuvwxyz',
      baseURL: 'http://localhost:3000',
      database: memoryAdapter({
        user: [
          {
            id: 'admin-id',
            name: 'Admin',
            username: 'admin@acmeltda',
            email: 'admin@users.invalid',
            emailVerified: false,
            companyId: 'company-id',
            role: 'admin',
            createdAt: now,
            updatedAt: now,
          },
        ],
        account: [
          {
            id: 'account-id',
            accountId: 'admin-id',
            userId: 'admin-id',
            providerId: 'credential',
            password: await hashPassword(password),
            createdAt: now,
            updatedAt: now,
          },
        ],
        session: [],
        verification: [],
      }),
    });
  });

  function post(path: string, body: object) {
    return auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('logs in using the generated admin username and a Better Auth credential hash', async () => {
    const response = await post('/sign-in/username', {
      username: 'ADMIN@ACMELTDA',
      password,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).user).toMatchObject({
      username: 'admin@acmeltda',
      companyId: 'company-id',
      role: 'admin',
    });
    expect(response.headers.get('set-cookie')).toBeTruthy();
  });

  it('rejects an incorrect password', async () => {
    expect(
      (
        await post('/sign-in/username', {
          username: 'admin@acmeltda',
          password: 'wrong-password',
        })
      ).status,
    ).toBe(401);
  });

  it.each(['/sign-in/email', '/sign-up/email', '/update-user'])(
    'disables %s',
    async (path) => {
      expect(
        (
          await post(path, {
            name: 'Test',
            email: 'admin@users.invalid',
            password,
          })
        ).status,
      ).toBe(404);
    },
  );

  it('normalizes the company and requires a literal plus for regular usernames', () => {
    expect(companyUsernameSuffix('São José Ltda.')).toBe('saojoseltda');
    expect(isValidUsername('ana+silva@saojoseltda')).toBe(true);
    expect(isValidUsername('admin@saojoseltda')).toBe(true);
    for (const value of [
      'ana@saojoseltda',
      'ana.silva@saojoseltda',
      'ana+@empresa',
      'ana+silva@',
      'ana+silva@outra@empresa',
    ]) {
      expect(isValidUsername(value)).toBe(false);
    }
  });
});
