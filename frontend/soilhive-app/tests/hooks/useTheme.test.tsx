import { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { ThemeProvider } from '../../src/contexts/ThemeContext';
import useTheme from 'hooks/useTheme';
import useConfig from 'hooks/useConfig';
import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useConfig');
jest.mock('hooks/useApiQuery');

jest.mock('../../src/App', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

jest.mock('../../src/configuration/api', () => ({
  REST_END_POINTS: {
    LOGO: 'logo',
  },
}));

describe('ThemeProvider / useTheme', () => {
  const saveTermsConfigMock = jest.fn();
  const saveThemeConfigMock = jest.fn();

  const originalCreateObjectURL = URL.createObjectURL;

  const frontendTheme = {
    primary: '#111111',
    'primary-hover': '#222222',
    'primary-active': '#333333',
    'primary-disabled': '#444444',
    secondary: '#555555',
    'secondary-hover': '#666666',
    'secondary-active': '#777777',
    'secondary-disabled': '#888888',
  };

  const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;

  beforeEach(() => {
    document.documentElement.style.cssText = '';

    (useConfig as jest.Mock).mockImplementation((key: string) => {
      if (key === 'terms_and_conditions') {
        return {
          isLoading: false,
          config: { html: '<p>Terms text</p>' },
          saveConfig: saveTermsConfigMock,
        };
      }

      if (key === 'frontend_theme') {
        return {
          isLoading: false,
          config: frontendTheme,
          saveConfig: saveThemeConfigMock,
        };
      }

      return {
        isLoading: false,
        config: null,
        saveConfig: jest.fn(),
      };
    });

    (useApiQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
    });

    URL.createObjectURL = jest.fn(() => 'blob:logo-url');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  it('throws if hook is used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeContext');

    spy.mockRestore();
  });

  it('returns initial context values', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toEqual(frontendTheme);
    });

    expect(result.current.logo).toBe(null);
    expect(result.current.isLogoLoading).toBe(false);
    expect(result.current.isLoadingTermsAndConditions).toBe(false);
    expect(result.current.termsAndConditionsHtml).toBe('<p>Terms text</p>');
    expect(result.current.saveThemeConfig).toBe(saveThemeConfigMock);
    expect(typeof result.current.handleColorChange).toBe('function');
    expect(typeof result.current.saveTermsAndConditions).toBe('function');
    expect(typeof result.current.setLogo).toBe('function');
  });

  it('applies theme colors to css variables', async () => {
    renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#111111');
    });

    expect(document.documentElement.style.getPropertyValue('--color-primary-hover')).toBe('#222222');
    expect(document.documentElement.style.getPropertyValue('--color-primary-active')).toBe('#333333');
    expect(document.documentElement.style.getPropertyValue('--color-primary-disabled')).toBe('#444444');
    expect(document.documentElement.style.getPropertyValue('--color-secondary')).toBe('#555555');
    expect(document.documentElement.style.getPropertyValue('--color-secondary-hover')).toBe('#666666');
    expect(document.documentElement.style.getPropertyValue('--color-secondary-active')).toBe('#777777');
    expect(document.documentElement.style.getPropertyValue('--color-secondary-disabled')).toBe('#888888');
  });

  it('creates logo url from blob response', async () => {
    const blob = new Blob(['logo'], { type: 'image/png' });

    (useApiQuery as jest.Mock).mockReturnValue({
      data: blob,
      isLoading: false,
    });

    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    });

    expect(result.current.logo).toBe('blob:logo-url');
  });

  it('does not create logo url while logo is loading', () => {
    const blob = new Blob(['logo'], { type: 'image/png' });

    (useApiQuery as jest.Mock).mockReturnValue({
      data: blob,
      isLoading: true,
    });

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(result.current.logo).toBe(null);
    expect(result.current.isLogoLoading).toBe(true);
  });

  it('does not create logo url when there is no logo response', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(result.current.logo).toBe(null);
  });

  it('saveTermsAndConditions calls saveConfig with html payload', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    await act(async () => {
      await result.current.saveTermsAndConditions('<h1>Updated</h1>');
    });

    expect(saveTermsConfigMock).toHaveBeenCalledWith({
      html: '<h1>Updated</h1>',
    });
  });

  it('exposes saveThemeConfig from useConfig', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    const newTheme = {
      primary: '#aaaaaa',
      'primary-hover': '#bbbbbb',
      'primary-active': '#cccccc',
      'primary-disabled': '#dddddd',
      secondary: '#eeeeee',
      'secondary-hover': '#ffffff',
      'secondary-active': '#121212',
      'secondary-disabled': '#343434',
    };

    await act(async () => {
      await result.current.saveThemeConfig(newTheme);
    });

    expect(saveThemeConfigMock).toHaveBeenCalledWith(newTheme);
  });

  it('setLogo updates logo manually', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.theme).toEqual(frontendTheme);
    });

    act(() => {
      result.current.setLogo('manual-logo-url');
    });

    expect(result.current.logo).toBe('manual-logo-url');
  });
});
