import { lastDayOfTheMonth } from '../../src/utilities/date';

describe('lastDayOfTheMonth', () => {
  it('returns the last day of the month of a given date', () => {
    expect(lastDayOfTheMonth(new Date('2025-01-01')).toISOString()).toBe('2025-01-31T22:59:59.999Z');
    expect(lastDayOfTheMonth(new Date('2025-01-31')).toISOString()).toBe('2025-01-31T22:59:59.999Z');
    expect(lastDayOfTheMonth(new Date('2025-12-01')).toISOString()).toBe('2025-12-31T22:59:59.999Z');
    expect(lastDayOfTheMonth(new Date('2025-02-01')).toISOString()).toBe('2025-02-28T22:59:59.999Z');
  });
});
