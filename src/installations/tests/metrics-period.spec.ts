import { metricsPeriod } from '../metrics-period.js';

describe('installation metrics period', () => {
  it('defaults to today in São Paulo regardless of the server timezone', () => {
    const now = new Date('2026-09-13T15:00:00Z');
    expect(metricsPeriod({}, now)).toEqual({
      from: new Date('2026-09-13T03:00:00Z'),
      to: now,
    });
    expect(metricsPeriod({}, new Date('2026-09-13T01:00:00Z')).from).toEqual(
      new Date('2026-09-12T03:00:00Z'),
    );
  });

  it('normalizes explicitly supplied offsets', () => {
    expect(
      metricsPeriod({
        from: '2026-09-12T00:00:00-03:00',
        to: '2026-09-13T00:00:00-03:00',
      }),
    ).toEqual({
      from: new Date('2026-09-12T03:00:00Z'),
      to: new Date('2026-09-13T03:00:00Z'),
    });
  });

  it.each([
    { from: '2026-09-13T00:00:00Z' },
    { to: '2026-09-13T00:00:00Z' },
    { from: '2026-09-13', to: '2026-09-14T00:00:00Z' },
    { from: '2026-02-30T00:00:00Z', to: '2026-03-01T00:00:00Z' },
    { from: '2026-09-13T00:00:00', to: '2026-09-14T00:00:00Z' },
    { from: '2026-09-13T00:00:00Z', to: '2026-09-13T00:00:00Z' },
    { from: '2026-09-14T00:00:00Z', to: '2026-09-13T00:00:00Z' },
    { from: ['2026-09-13T00:00:00Z'], to: '2026-09-14T00:00:00Z' },
    { companyId: 'other-company' },
  ])('rejects an invalid or ambiguous period: %j', (input) => {
    expect(() => metricsPeriod(input)).toThrow();
  });
});
