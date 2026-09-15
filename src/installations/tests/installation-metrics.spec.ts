import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InstallationsService } from '../installations.service.js';

describe('installation metrics authorization', () => {
  const period = { from: '2026-09-12T00:00:00Z', to: '2026-09-13T00:00:00Z' };
  function fixture(
    actor: object | undefined,
    installation: object | undefined,
  ) {
    const rows = [actor ? [actor] : [], installation ? [installation] : []];
    const db = {
      select: vi.fn(() => ({
        from: () => ({ where: async () => rows.shift() }),
      })),
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            value: null,
            validSamples: 0,
            invalidSamples: 0,
            duplicateSamples: 0,
          },
        ],
      }),
    };
    return { service: new InstallationsService(db as never), db };
  }

  it.each(['admin', 'user'])(
    'blocks %s from another company before aggregating any readings',
    async (role) => {
      const { service, db } = fixture(
        { id: 'user', role, companyId: 'a' },
        { id: 'installation', companyId: 'b' },
      );
      await expect(
        service.metrics('user', 'installation', period),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.execute).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'user', 'super_admin'])(
    'allows %s to read its company metrics',
    async (role) => {
      const { service, db } = fixture(
        { id: 'user', role, companyId: 'a' },
        { id: 'installation', companyId: 'a' },
      );
      expect(
        await service.metrics('user', 'installation', period),
      ).toMatchObject({
        installationId: 'installation',
        period: { timeZone: 'America/Sao_Paulo' },
        metrics: {
          energyConsumed: {
            value: null,
            estimated: true,
            unit: 'kWh',
            samplingIntervalSeconds: 15,
          },
        },
      });
      expect(db.execute).toHaveBeenCalledTimes(1);
    },
  );

  it('allows super_admin to read another company', async () => {
    const { service, db } = fixture(
      { id: 'root', role: 'super_admin', companyId: 'a' },
      { companyId: 'b' },
    );
    await service.metrics('root', 'installation', period);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('returns 401 or 404 without querying telemetry', async () => {
    for (const [actor, error] of [
      [undefined, UnauthorizedException],
      [{ id: 'user', role: 'user', companyId: 'a' }, NotFoundException],
    ] as const) {
      const { service, db } = fixture(actor, undefined);
      await expect(
        service.metrics('user', 'missing', period),
      ).rejects.toBeInstanceOf(error);
      expect(db.execute).not.toHaveBeenCalled();
    }
  });
});
