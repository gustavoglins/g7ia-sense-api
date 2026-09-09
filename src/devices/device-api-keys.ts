import { randomBytes } from 'node:crypto';

export type DeviceApiKeyType = 'read' | 'write';

export function generateDeviceApiKey(type: DeviceApiKeyType) {
  return `g7_${type}_${randomBytes(32).toString('base64url')}`;
}
