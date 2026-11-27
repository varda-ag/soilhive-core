import type { MenuOption } from 'components/UI/types';
import { COUNTRY_CODES } from 'configuration/countries';

// The countries by name in the given language, sorted by it. A code the browser has no name for
// shows the code.
export const countryOptionsOf = (language: string): MenuOption[] => {
  const names = new Intl.DisplayNames([language, 'en'], { type: 'region' });
  return COUNTRY_CODES.map(code => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, language));
};
