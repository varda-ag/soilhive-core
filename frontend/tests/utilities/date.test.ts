import { register, unregister, type TimeZone } from 'timezone-mock';
import { backendToLocalFrontendDate, dateStringToDDMMYYYY, firstDayOfTheMonth, lastDayOfTheMonth } from '../../src/utilities/date';
import { testTimezones } from '../setupTests';

describe.each(testTimezones)('date utilities (multiple-timezones)', testTimezone => {
  beforeEach(() => {
    register(testTimezone.tz as TimeZone);
  });

  afterEach(() => {
    unregister();
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
    it('given undefined, throws', () => {
      expect(() => backendToLocalFrontendDate(undefined as unknown as string)).toThrow();
    });

    it('given null, throws', () => {
      expect(() => backendToLocalFrontendDate(null as unknown as string)).toThrow();
    });

    it.each([['2025'], ['2024']])('given YYYY (%s), returns Jan 1st of that year', inputStringDate => {
      const result = backendToLocalFrontendDate(inputStringDate);
      expect(result.getFullYear()).toBe(Number(inputStringDate));
      expect(result.getMonth() + 1).toBe(1);
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it.each([['2025-01'], ['2025-12'], ['2024-02']])('given YYYY-MM (%s), returns the 1st of that month', inputStringDate => {
      const result = backendToLocalFrontendDate(inputStringDate);
      const [year, month] = inputStringDate.split('-').map(Number);
      expect(result.getFullYear()).toBe(year);
      expect(result.getMonth() + 1).toBe(month);
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it.each([['2025-01-01'], ['2025-01-31'], ['2025-12-01'], ['2025-12-31'], ['2025-02-01'], ['2024-02-01']])(
      'given YYYY-MM-DD (%s), returns the correct date',
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

    it.each([
      ['2025-01-15T10:30:00', 2025, 1, 15, 10, 30, 0],
      ['2025-12-31T23:59:59', 2025, 12, 31, 23, 59, 59],
    ])(
      'given YYYY-MM-DDTHH:MM:SS (%s), returns the correct local date and time',
      (inputStringDate, year, month, day, hours, minutes, seconds) => {
        const result = backendToLocalFrontendDate(inputStringDate);
        expect(isNaN(result.getTime())).toBe(false);
        expect(result.getFullYear()).toBe(year);
        expect(result.getMonth() + 1).toBe(month);
        expect(result.getDate()).toBe(day);
        expect(result.getHours()).toBe(hours);
        expect(result.getMinutes()).toBe(minutes);
        expect(result.getSeconds()).toBe(seconds);
      },
    );
  });
});

describe('dateStringToDDMMYYYY', () => {
  it('returns "—" for null', () => {
    expect(dateStringToDDMMYYYY(null)).toBe('—');
  });

  it.each([
    [new Date(2025, 5, 15), '15-06-2025'],
    [new Date(2025, 0, 1), '01-01-2025'],
    [new Date(2025, 11, 31), '31-12-2025'],
    [new Date(2024, 1, 29), '29-02-2024'],
  ])('given a Date object, returns DD-MM-YYYY', (input, expected) => {
    expect(dateStringToDDMMYYYY(input)).toBe(expected);
  });

  it('pads single-digit day and month with leading zero', () => {
    expect(dateStringToDDMMYYYY(new Date(2025, 2, 5))).toBe('05-03-2025');
  });

  it('returns date string separated by custom separator', () => {
    expect(dateStringToDDMMYYYY(new Date(2025, 2, 5), '/')).toBe('05/03/2025');
  });
});
