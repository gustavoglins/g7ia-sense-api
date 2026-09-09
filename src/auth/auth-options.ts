import type { BetterAuthOptions } from 'better-auth';
import { username } from 'better-auth/plugins';
import { userOptions } from './user-options.js';
import { isValidUsername, normalizeUsername } from './username.js';

// Keep the credential authenticator enabled for username/password verification.
// Provisioning users is handled by the application, never by public sign-up.
export const authOptions = {
  user: userOptions,
  emailAndPassword: { enabled: true, disableSignUp: true },
  disabledPaths: ['/sign-in/email', '/sign-up/email', '/update-user'],
  plugins: [
    username({
      displayUsername: false,
      immutableUsername: true,
      maxUsernameLength: 255,
      usernameNormalization: normalizeUsername,
      usernameValidator: (value) => isValidUsername(normalizeUsername(value)),
      validationOrder: { username: 'pre-normalization' },
    }),
  ],
} satisfies BetterAuthOptions;
