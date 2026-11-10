import { act, render } from '@testing-library/react';
import * as CookieConsent from 'vanilla-cookieconsent';
import { CookieConsentProvider } from 'components/CookieConsentProvider';

jest.mock('vanilla-cookieconsent', () => ({
  run: jest.fn(),
  acceptedService: jest.fn(),
  showPreferences: jest.fn(),
}));

jest.mock('utilities/environmentVariables', () => ({
  GTM_CONTAINER_ID: 'GTM-TEST',
  COOKIE_DOMAIN: 'localhost',
}));

const runMock = CookieConsent.run as jest.Mock;
const acceptedServiceMock = CookieConsent.acceptedService as jest.Mock;
const gtmScripts = () => document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtm.js"]');
// jsdom cannot reload a page: it reports the attempt as a "navigation" it does not implement
const reloadAttempts = (consoleError: jest.SpyInstance) =>
  consoleError.mock.calls.filter(([error]) => String(error?.message ?? error).includes('navigation')).length;

describe('CookieConsentProvider', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.querySelectorAll('script').forEach(s => s.remove());
    document.head.appendChild(document.createElement('script'));
    delete (window as any).dataLayer;
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it('loads GTM once for a returning visitor who accepted analytics, though the library also reports the consent on load', () => {
    acceptedServiceMock.mockReturnValue(true);
    // As vanilla-cookieconsent does on each page load with a valid consent
    runMock.mockImplementation(({ onConsent }) => onConsent());

    render(<CookieConsentProvider>content</CookieConsentProvider>);

    expect(gtmScripts()).toHaveLength(1);
    const gtmStarts = (window.dataLayer as Record<string, unknown>[]).filter(entry => entry.event === 'gtm.js');
    expect(gtmStarts).toHaveLength(1);
  });

  it('reloads the page when a visitor withdraws the consent after GTM was loaded, so the tracking stops', () => {
    acceptedServiceMock.mockReturnValue(true);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    expect(gtmScripts()).toHaveLength(1);

    acceptedServiceMock.mockReturnValue(false);
    act(() => runMock.mock.lastCall[0].onChange());

    expect(reloadAttempts(consoleError)).toBe(1);
  });

  it('does not reload for a visitor who never accepted analytics', () => {
    acceptedServiceMock.mockReturnValue(false);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    act(() => runMock.mock.lastCall[0].onConsent());

    expect(gtmScripts()).toHaveLength(0);
    expect(reloadAttempts(consoleError)).toBe(0);
  });
});
