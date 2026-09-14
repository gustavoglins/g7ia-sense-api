import { BadRequestException } from '@nestjs/common';
import { listQuery } from '../common/list-query.js';
import { parseTelemetryTime } from '../telemetry/telemetry.service.js';

export const METRICS_TIME_ZONE = 'America/Sao_Paulo';
export type MetricsPeriod = { from: Date; to: Date };

function startOfToday(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: METRICS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((value) => value.type === type)!.value);
  const midnightUtc = Date.UTC(part('year'), part('month') - 1, part('day'));
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: METRICS_TIME_ZONE,
    timeZoneName: 'longOffset',
  });
  // Resolve the offset at midnight, independently of the server's local timezone.
  let midnight = midnightUtc;
  for (let iteration = 0; iteration < 2; iteration++) {
    const offset = offsetFormatter
      .formatToParts(new Date(midnight))
      .find((value) => value.type === 'timeZoneName')!.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
    const minutes = match
      ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1)
      : 0;
    midnight = midnightUtc - minutes * 60_000;
  }
  return new Date(midnight);
}

export function metricsPeriod(
  input: unknown = {},
  now = new Date(),
): MetricsPeriod {
  const query = listQuery(input, ['from', 'to']);
  if (query.from === undefined && query.to === undefined)
    return { from: startOfToday(now), to: now };
  if (query.from === undefined || query.to === undefined)
    throw new BadRequestException(
      'Informe from e to juntos, ou omita ambos para consultar hoje.',
    );
  const parse = (field: 'from' | 'to') => {
    try {
      return parseTelemetryTime(query[field]);
    } catch {
      throw new BadRequestException(
        `${field} deve ser uma data válida em ISO 8601 com fuso horário.`,
      );
    }
  };
  const from = parse('from');
  const to = parse('to');
  if (from >= to) throw new BadRequestException('from deve ser anterior a to.');
  return { from, to };
}
