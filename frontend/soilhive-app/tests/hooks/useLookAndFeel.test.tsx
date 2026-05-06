import { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { LookAndFeelProvider } from '../../src/contexts/LookAndFeelContext';
import useLookAndFeel from 'hooks/useLookAndFeel';
import { REST_END_POINTS } from '../../src/configuration/api';
import { queryClient } from '../../src/App';
import { useApiMutation } from 'hooks/useApiMutation';
import useTheme from 'hooks/useTheme';
import useNotifications from 'hooks/useNotifications';

jest.mock('hooks/useApiMutation');
jest.mock('hooks/useTheme');
jest.mock('hooks/useNotifications');

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

describe('LookAndFeelProvider / useLookAndFeel', () => {
  const saveMutateAsync = jest.fn();
  const deleteMutateAsync = jest.fn();
  const showNotification = jest.fn();
  const setLogo = jest.fn();
  const saveColors = jest.fn();
  const saveDefaultColors = jest.fn();

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  const wrapper = ({ children }: PropsWithChildren) => <LookAndFeelProvider>{children}</LookAndFeelProvider>;

  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'server-logo-url',
      themeConfig: { colors: {}, defaultColors: undefined },
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    (useNotifications as jest.Mock).mockReturnValue({
      showNotification,
    });

    (useApiMutation as jest.Mock).mockImplementation(({ method }: { method: string }) => {
      if (method === 'POST') {
        return { mutateAsync: saveMutateAsync };
      }

      if (method === 'DELETE') {
        return { mutateAsync: deleteMutateAsync };
      }

      return { mutateAsync: jest.fn() };
    });

    URL.createObjectURL = jest.fn(() => 'blob:preview-logo');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('throws if hook is used outside provider', () => {
    expect(() => renderHook(() => useLookAndFeel())).toThrow('useLookAndFeel must be used within a LookAndFeelContext');
  });

  it('returns initial values', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.logo).toBe('server-logo-url');
    expect(result.current.previewLogo).toBe('server-logo-url');
    expect(result.current.isActualLogo).toBe(true);
    expect(result.current.colors).toEqual({});
    expect(result.current.defaultColors).toBeUndefined();
    expect(typeof result.current.handleDefaultColorsSave).toBe('function');
    expect(typeof result.current.restoreDefaultColors).toBe('function');
  });

  it('initializes colors from themeConfig', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'server-logo-url',
      themeConfig: { colors: { primary: '#123456', secondary: '#abcdef' }, defaultColors: undefined },
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await waitFor(() => {
      expect(result.current.colors).toEqual({ primary: '#123456', secondary: '#abcdef' });
    });
  });

  it('handleColorChange updates colors state', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
    });

    expect(result.current.colors).toEqual({ primary: '#ff0000' });
  });

  it('handleColorChange merges multiple color changes', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
      result.current.handleColorChange('secondary', '#00ff00');
    });

    expect(result.current.colors).toEqual({ primary: '#ff0000', secondary: '#00ff00' });
  });

  it('handleColorChange skips setColorsChanged when already changed', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    // First call — colorsChanged transitions false → true
    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
    });

    // Second call after re-render — colorsChanged is already true, branch is skipped
    act(() => {
      result.current.handleColorChange('primary', '#00ff00');
    });

    expect(result.current.colors).toEqual({ primary: '#00ff00' });
  });

  it('does not set colors when themeConfig.colors is falsy', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'server-logo-url',
      themeConfig: {},
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await waitFor(() => {
      expect(result.current.colors).toEqual({});
    });
  });

  it('handleLogoChange sets preview logo and marks it as changed', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file = new File(['file-content'], 'logo.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file);
    });

    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(result.current.previewLogo).toBe('blob:preview-logo');
    expect(result.current.isActualLogo).toBe(false);
  });

  it('handleLogoChange revokes previous preview url before creating new one', () => {
    (URL.createObjectURL as jest.Mock).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');

    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file1 = new File(['first'], 'first.png', { type: 'image/png' });
    const file2 = new File(['second'], 'second.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file1);
    });

    act(() => {
      result.current.handleLogoChange(file2);
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(result.current.previewLogo).toBe('blob:second');
  });

  it('deleteLogo clears preview and revokes current preview url', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file = new File(['file-content'], 'logo.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file);
    });

    act(() => {
      result.current.deleteLogo();
    });

    expect(result.current.previewLogo).toBe(null);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-logo');
  });

  it('resetChanges restores original logo and clears refs', () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file = new File(['file-content'], 'logo.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file);
    });

    expect(result.current.previewLogo).toBe('blob:preview-logo');
    expect(result.current.isActualLogo).toBe(false);

    act(() => {
      result.current.resetChanges();
    });

    expect(result.current.previewLogo).toBe('server-logo-url');
    expect(result.current.isActualLogo).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-logo');
  });

  it('saveLogo does nothing when there is no preview file', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await act(async () => {
      await result.current.saveLogo();
    });

    expect(saveMutateAsync).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('saveLogo uploads file and invalidates queries', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file = new File(['file-content'], 'logo.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file);
    });

    await act(async () => {
      await result.current.saveLogo();
    });

    expect(saveMutateAsync).toHaveBeenCalledTimes(1);

    const formDataArg = saveMutateAsync.mock.calls[0][0];
    expect(formDataArg).toBeInstanceOf(FormData);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [`${REST_END_POINTS.LOGO}`],
    });
  });

  it('saveChanges deletes existing logo when previewLogo is null', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.deleteLogo();
    });

    await act(async () => {
      await result.current.saveChanges();
    });

    expect(deleteMutateAsync).toHaveBeenCalledWith(null);
    expect(setLogo).toHaveBeenCalledWith(null);
    expect(showNotification).toHaveBeenCalledWith({
      id: 'lookAndFeelSuccess',
      title: 'Success',
      message: 'New theme settings have been published',
      type: 'success',
    });
  });

  it('saveChanges uploads preview file when it exists', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    const file = new File(['file-content'], 'logo.png', { type: 'image/png' });

    act(() => {
      result.current.handleLogoChange(file);
    });

    await act(async () => {
      await result.current.saveChanges();
    });

    expect(saveMutateAsync).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [`${REST_END_POINTS.LOGO}`],
    });
    expect(showNotification).toHaveBeenCalledWith({
      id: 'lookAndFeelSuccess',
      title: 'Success',
      message: 'New theme settings have been published',
      type: 'success',
    });
  });

  it('saveChanges calls saveColors when colors have been changed', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
    });

    await act(async () => {
      await result.current.saveChanges();
    });

    expect(saveColors).toHaveBeenCalledWith({ primary: '#ff0000' });
    expect(showNotification).toHaveBeenCalledWith({
      id: 'lookAndFeelSuccess',
      title: 'Success',
      message: 'New theme settings have been published',
      type: 'success',
    });
  });

  it('saveChanges does not call saveColors when colors have not changed', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await act(async () => {
      result.current.saveChanges();
    });

    expect(saveColors).not.toHaveBeenCalled();
  });

  it('exposes defaultColors from themeConfig', async () => {
    const mockDefaultColors = { primary: '#aaaaaa', secondary: '#bbbbbb' };
    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'server-logo-url',
      themeConfig: { colors: {}, defaultColors: mockDefaultColors },
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await waitFor(() => {
      expect(result.current.defaultColors).toEqual(mockDefaultColors);
    });
  });

  it('handleDefaultColorsSave calls saveDefaultColors with current colors and shows notification', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
    });

    await act(async () => {
      result.current.handleDefaultColorsSave();
    });

    expect(saveDefaultColors).toHaveBeenCalledWith({ primary: '#ff0000' });
    expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'defaultColorsSuccess', type: 'success' }));
  });

  it('restoreDefaultColors restores colors from defaultColors and marks as changed', async () => {
    const mockDefaultColors = { primary: '#aaaaaa', secondary: '#bbbbbb' };
    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'server-logo-url',
      themeConfig: { colors: { primary: '#111111' }, defaultColors: mockDefaultColors },
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    await waitFor(() => {
      expect(result.current.colors).toEqual({ primary: '#111111' });
    });

    act(() => {
      result.current.restoreDefaultColors();
    });

    expect(result.current.colors).toEqual(mockDefaultColors);
  });

  it('restoreDefaultColors does nothing when defaultColors is undefined', async () => {
    const { result } = renderHook(() => useLookAndFeel(), { wrapper });

    act(() => {
      result.current.handleColorChange('primary', '#ff0000');
    });

    act(() => {
      result.current.restoreDefaultColors();
    });

    // colors should remain unchanged since defaultColors is undefined
    expect(result.current.colors).toEqual({ primary: '#ff0000' });
  });

  it('updates previewLogo when external logo changes', async () => {
    const { result, rerender } = renderHook(() => useLookAndFeel(), { wrapper });

    expect(result.current.previewLogo).toBe('server-logo-url');

    (useTheme as jest.Mock).mockReturnValue({
      isLogoLoading: false,
      logo: 'updated-logo-url',
      themeConfig: { colors: {}, defaultColors: undefined },
      setLogo,
      saveColors,
      saveDefaultColors,
    });

    rerender();

    await waitFor(() => {
      expect(result.current.previewLogo).toBe('updated-logo-url');
    });
  });
});
