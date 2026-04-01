import { backendToLocalFrontendDate, firstDayOfTheMonth, lastDayOfTheMonth } from '../../src/utilities/date';
import { testTimezones } from '../setupTests';

describe.each(testTimezones)('date utilities (multiple-timezones)', testTimezone => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2020-01-01T01:00:01Z').getTime() + testTimezone.offsetMs);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('lastDayOfTheMonth', () => {
    it.each([
      ['2025-01-01', '2025-01-31'],
      ['2025-01-31', '2025-01-31'],
      ['2025-12-01', '2025-12-31'],
      ['2025-12-31', '2025-12-31'],
      ['2025-02-01', '2025-02-28'],
      ['2024-02-01', '2024-02-29'],
    ])('given %s, returns the last day of the month: %s', (inputDate, expectedDate) => {
      const [year, month, day] = inputDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const result = lastDayOfTheMonth(date);
      const [expectedYear, expectedMonth, expectedDay] = expectedDate.split('-').map(Number);
      expect(result.getFullYear()).toBe(expectedYear);
      expect(result.getMonth() + 1).toBe(expectedMonth);
      expect(result.getDate()).toBe(expectedDay);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
    });
  });

  describe('firstDayOfTheMonth', () => {
    it.each([
      ['2025-01-01', '2025-01-01'],
      ['2025-01-31', '2025-01-01'],
      ['2025-12-01', '2025-12-01'],
      ['2025-12-31', '2025-12-01'],
      ['2025-02-01', '2025-02-01'],
      ['2024-02-01', '2024-02-01'],
    ])('given %s, returns the first day of the month: %s', (inputDate, expectedDate) => {
      const [year, month, day] = inputDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const result = firstDayOfTheMonth(date);
      const [expectedYear, expectedMonth, expectedDay] = expectedDate.split('-').map(Number);
      expect(result.getFullYear()).toBe(expectedYear);
      expect(result.getMonth() + 1).toBe(expectedMonth);
      expect(result.getDate()).toBe(expectedDay);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe('backendToLocalFrontendDate', () => {
    it.each([['2025-01-01'], ['2025-01-31'], ['2025-12-01'], ['2025-12-31'], ['2025-02-01'], ['2024-02-01']])(
      'given %s, returns the correct date',
      inputStringDate => {
        const result = backendToLocalFrontendDate(inputStringDate);
        const [year, month, day] = inputStringDate.split('-').map(Number);
        expect(result.getFullYear()).toBe(year);
        expect(result.getMonth() + 1).toBe(month);
        expect(result.getDate()).toBe(day);
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
      },
    );
  });
});
