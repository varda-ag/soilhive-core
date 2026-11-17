import { act, fireEvent, render, screen } from '@testing-library/react';
import * as CookieConsent from 'vanilla-cookieconsent';
import { CookieConsentProvider, useCookieConsent } from 'components/CookieConsentProvider';

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
// The dataLayer entries, with each gtag command (an arguments object) as the array of its arguments
const dataLayerEntries = () =>
  ((window.dataLayer ?? []) as unknown[]).map(entry =>
    Object.prototype.toString.call(entry) === '[object Arguments]' ? Array.from(entry as IArguments) : entry,
  );
const consentCommands = () => dataLayerEntries().filter(entry => Array.isArray(entry) && entry[0] === 'consent');

describe('CookieConsentProvider', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.querySelectorAll('script').forEach(s => s.remove());
    document.head.appendChild(document.createElement('script'));
    delete (window as any).dataLayer;
    document.cookie = '_ga=; path=/; max-age=0';
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

  it('queues the Consent Mode default and the update granting analytics before gtm.js when a visitor accepts', () => {
    acceptedServiceMock.mockReturnValue(false);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    expect(window.dataLayer).toBeUndefined();

    acceptedServiceMock.mockReturnValue(true);
    act(() => runMock.mock.lastCall[0].onConsent());

    const entries = dataLayerEntries();
    expect(entries[0]).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })]);
    expect(entries[1]).toEqual(['consent', 'update', { analytics_storage: 'granted' }]);
    expect(entries[2]).toEqual(expect.objectContaining({ event: 'gtm.js' }));
  });

  it('grants analytics once on each load for a returning visitor who accepted', () => {
    acceptedServiceMock.mockReturnValue(true);
    runMock.mockImplementation(({ onConsent }) => onConsent());

    render(<CookieConsentProvider>content</CookieConsentProvider>);

    expect(consentCommands()).toEqual([
      ['consent', 'default', expect.any(Object)],
      ['consent', 'update', { analytics_storage: 'granted' }],
    ]);
  });

  it('denies analytics and deletes GA4 cookies before reloading when a visitor withdraws the consent', () => {
    acceptedServiceMock.mockReturnValue(true);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    document.cookie = '_ga=GA1.1.123.456; path=/';

    acceptedServiceMock.mockReturnValue(false);
    act(() => runMock.mock.lastCall[0].onChange());

    expect(consentCommands().slice(-1)[0]).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(document.cookie).not.toContain('_ga=');
    expect(reloadAttempts(consoleError)).toBe(1);
  });

  describe('Cookie settings link', () => {
    const Consumer = () => {
      const { hasOptionalCookies, cookieSettingsLabel, showPreferences } = useCookieConsent();
      return hasOptionalCookies ? <button onClick={showPreferences}>{cookieSettingsLabel}</button> : null;
    };
    let browserLanguage: jest.SpyInstance;
    const renderWithBrowserLanguage = (language: string) => {
      browserLanguage = jest.spyOn(navigator, 'language', 'get').mockReturnValue(language);
      acceptedServiceMock.mockReturnValue(false);
      render(
        <CookieConsentProvider>
          <Consumer />
        </CookieConsentProvider>,
      );
    };

    afterEach(() => browserLanguage.mockRestore());

    it('lets the page reopen the cookie preferences', () => {
      renderWithBrowserLanguage('en-US');
      fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }));

      expect(CookieConsent.showPreferences).toHaveBeenCalledTimes(1);
    });

    it("labels it in the banner's language", () => {
      renderWithBrowserLanguage('it-IT');

      expect(runMock.mock.lastCall[0].language.default).toBe('it');
      expect(screen.getByRole('button')).toHaveTextContent('Impostazioni cookie');
    });

    it('labels it in English, as the banner, for a language the banner has no texts in', () => {
      renderWithBrowserLanguage('fr-FR');

      expect(runMock.mock.lastCall[0].language.default).toBe('en');
      expect(screen.getByRole('button')).toHaveTextContent('Cookie settings');
    });
  });

  it('does not reload for a visitor who never accepted analytics', () => {
    acceptedServiceMock.mockReturnValue(false);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    act(() => runMock.mock.lastCall[0].onConsent());

    expect(gtmScripts()).toHaveLength(0);
    expect(reloadAttempts(consoleError)).toBe(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('leaves the GA4 cookies of a visitor who never accepted analytics here, which another site on the domain may have set', () => {
    document.cookie = '_ga=GA1.1.123.456; path=/';
    acceptedServiceMock.mockReturnValue(false);
    render(<CookieConsentProvider>content</CookieConsentProvider>);
    act(() => runMock.mock.lastCall[0].onConsent());

    expect(document.cookie).toContain('_ga=');
  });
});
