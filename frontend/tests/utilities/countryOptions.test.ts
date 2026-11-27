import { COUNTRY_CODES } from 'configuration/countries';
import { countryOptionsOf } from 'utilities/countryOptions';

describe('countryOptionsOf', () => {
  it('offers each of the 249 codes the backend takes once', () => {
    const options = countryOptionsOf('en');

    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    expect(options.map(({ code }) => code).sort()).toEqual([...COUNTRY_CODES].sort());
  });

  it('names them in the given language, sorted by name', () => {
    const english = countryOptionsOf('en');
    const italian = countryOptionsOf('it');

    expect(english.find(({ code }) => code === 'DE')?.name).toBe('Germany');
    expect(italian.find(({ code }) => code === 'DE')?.name).toBe('Germania');
    const names = english.map(({ name }) => name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });
});
