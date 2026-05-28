import {
  formatDateTime,
  formatDateTimeLegacy,
  parseRangeToMs,
} from './date-format.util';

describe('parseRangeToMs', () => {
  it('"1h" retorna 3600000 ms', () => {
    expect(parseRangeToMs('1h')).toBe(3_600_000);
  });

  it('"6h" retorna 21600000 ms', () => {
    expect(parseRangeToMs('6h')).toBe(21_600_000);
  });

  it('"24h" retorna 86400000 ms', () => {
    expect(parseRangeToMs('24h')).toBe(86_400_000);
  });

  it('"7d" retorna 604800000 ms', () => {
    expect(parseRangeToMs('7d')).toBe(604_800_000);
  });

  it('"30d" retorna 2592000000 ms', () => {
    expect(parseRangeToMs('30d')).toBe(2_592_000_000);
  });

  it('"5m" retorna 300000 ms', () => {
    expect(parseRangeToMs('5m')).toBe(300_000);
  });

  it('valor inválido retorna default 1h (3600000 ms)', () => {
    expect(parseRangeToMs('bad')).toBe(3_600_000);
    expect(parseRangeToMs('')).toBe(3_600_000);
  });
});

describe('formatDateTime', () => {
  it('retorna string ISO-8601 válido para un Date', () => {
    const date = new Date('2026-03-12T02:27:30.000Z');
    const result = formatDateTime(date);
    expect(result).toBe('2026-03-12T02:27:30.000Z');
  });

  it('retorna string ISO-8601 válido para un string ISO', () => {
    const result = formatDateTime('2026-03-12T02:27:30Z');
    expect(result).toBe('2026-03-12T02:27:30.000Z');
  });

  it('con null retorna null', () => {
    expect(formatDateTime(null)).toBeNull();
  });

  it('con undefined retorna null', () => {
    expect(formatDateTime(undefined)).toBeNull();
  });

  it('no lanza excepción con inputs inesperados', () => {
    expect(() => formatDateTime(null)).not.toThrow();
    expect(() => formatDateTime(undefined)).not.toThrow();
  });
});

describe('formatDateTimeLegacy', () => {
  it('retorna formato DD/MM/YYYY HH:MM', () => {
    const date = new Date('2026-03-12T02:27:00Z');
    const result = formatDateTimeLegacy(date);
    // La hora depende de la zona local, verificamos el patrón
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('con null retorna null', () => {
    expect(formatDateTimeLegacy(null)).toBeNull();
  });

  it('con undefined retorna null', () => {
    expect(formatDateTimeLegacy(undefined)).toBeNull();
  });
});
