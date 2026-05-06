import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetsSettings } from 'hooks/useDatasetsSettings';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { useDataset } from 'hooks/useDatasets';
import { useDatasetEntitlements, useDatasetEntitlementsMutation } from 'hooks/useDatasetEntitlements';
import { useUpdateDatasetVisibilityMutation } from 'hooks/useDatasetMutation';
import { ADMIN_PATHS } from '../../src/configuration/admin';
import { queryClientWrapper } from '../queryClientWrapper';
import useTheme from 'hooks/useTheme';

const mockNavigate = jest.fn();
const mockMutateAsync = jest.fn().mockResolvedValue({});

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({
  useDataset: jest.fn(),
}));

jest.mock('hooks/useDatasetEntitlements', () => ({
  useDatasetEntitlements: jest.fn(),
  useDatasetEntitlementsMutation: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useUpdateDatasetVisibilityMutation: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

function setupMocks({
  authMode = 'oidc',
  datasetVisibility = 'public',
  entitlements = {},
  privacyPolicyHtml = '',
  termsAndConditionsHtml = '',
} = {}) {
  (useAuthContext as jest.Mock).mockReturnValue({ authMode });
  (useDataset as jest.Mock).mockReturnValue({ data: { visibility: datasetVisibility }, isLoading: false });
  (useDatasetEntitlements as jest.Mock).mockReturnValue({ data: entitlements, isLoading: false });
  (useUpdateDatasetVisibilityMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  (useDatasetEntitlementsMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  (useTheme as jest.Mock).mockReturnValue({ themeConfig: { privacyPolicyHtml, termsAndConditionsHtml } });
}

describe('useDatasetsSettings', () => {
  beforeEach(() => setupMocks());
  afterEach(() => jest.clearAllMocks());

  it('initialises visibility from dataset API response', async () => {
    setupMocks({ datasetVisibility: 'public' });
    const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
    await waitFor(() => expect(result.current.visibility).toBe('public'));
  });

  it('initialises accessEmails from entitlements API response', async () => {
    setupMocks({ entitlements: { 'a@example.com': ['preview'], 'b@example.com': ['download'] } });
    const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
    await waitFor(() => expect(result.current.accessEmails).toEqual([{ email: 'a@example.com' }, { email: 'b@example.com' }]));
  });

  it('isOidcAuth is true when authMode is oidc', () => {
    setupMocks({ authMode: 'oidc' });
    const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
    expect(result.current.isOidcAuth).toBe(true);
  });

  it('isOidcAuth is false when authMode is password', () => {
    setupMocks({ authMode: 'password' });
    const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
    expect(result.current.isOidcAuth).toBe(false);
  });

  it('initialises with empty email state and no dialogs open', () => {
    const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
    expect(result.current.emailInput).toBe('');
    expect(result.current.emailToDelete).toBeNull();
    expect(result.current.isPublishWarningVisible).toBe(false);
  });

  describe('handleEmailChange', () => {
    it('updates emailInput value', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('test@example.com'));
      expect(result.current.emailInput).toBe('test@example.com');
    });

    it('clears an existing emailError', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => {
        result.current.handleEmailChange('not-valid');
        result.current.handleEmailBlur();
        result.current.handleEmailChange('anything');
      });
      expect(result.current.emailError).toBe('');
    });
  });

  describe('handleEmailBlur', () => {
    it('sets error when input contains an invalid email', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('not-an-email'));
      act(() => result.current.handleEmailBlur());
      expect(result.current.emailError).toBeTruthy();
    });

    it('does not set error when input is blank', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailBlur());
      expect(result.current.emailError).toBe('');
    });
  });

  describe('handleAddEmail', () => {
    it('appends a valid email and clears the input', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toEqual([{ email: 'user@example.com' }]);
      expect(result.current.emailInput).toBe('');
    });

    it('sets error and does not add an invalid email', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('bad-email'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toHaveLength(0);
      expect(result.current.emailError).toBeTruthy();
    });

    it('does not add a duplicate email', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.accessEmails).toHaveLength(1);
    });

    it('sets error when a duplicate email is added', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      expect(result.current.emailError).toBeTruthy();
    });
  });

  describe('handleRequestRemoveEmail', () => {
    it('sets emailToDelete to the given address', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      expect(result.current.emailToDelete).toBe('user@example.com');
    });
  });

  describe('handleConfirmRemoveEmail', () => {
    it('removes the email from the list and clears emailToDelete', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      act(() => result.current.handleConfirmRemoveEmail());
      expect(result.current.accessEmails).toEqual([]);
      expect(result.current.emailToDelete).toBeNull();
    });

    it('does not affect other emails in the list', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('a@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleEmailChange('b@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('a@example.com'));
      act(() => result.current.handleConfirmRemoveEmail());
      expect(result.current.accessEmails).toEqual([{ email: 'b@example.com' }]);
    });
  });

  describe('handleCancelRemoveEmail', () => {
    it('clears emailToDelete without removing the email', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      act(() => result.current.handleRequestRemoveEmail('user@example.com'));
      act(() => result.current.handleCancelRemoveEmail());
      expect(result.current.emailToDelete).toBeNull();
      expect(result.current.accessEmails).toHaveLength(1);
    });
  });

  describe('handlePublish', () => {
    it('opens the publish warning dialog when no legal documents are configured', async () => {
      setupMocks();
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when legal document fields are empty strings', async () => {
      setupMocks({ privacyPolicyHtml: '', termsAndConditionsHtml: '' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when legal document fields are null', async () => {
      setupMocks({ privacyPolicyHtml: null as unknown as string, termsAndConditionsHtml: null as unknown as string });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when legal document fields are whitespace only', async () => {
      setupMocks({ privacyPolicyHtml: '   ', termsAndConditionsHtml: '   ' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when legal document fields contain only html tags', async () => {
      setupMocks({ privacyPolicyHtml: '<p></p>', termsAndConditionsHtml: '<p></p>' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when only privacy policy is configured', async () => {
      setupMocks({ privacyPolicyHtml: '<p>Policy</p>' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('opens the publish warning dialog when only terms of conditions is configured', async () => {
      setupMocks({ termsAndConditionsHtml: '<p>Terms</p>' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(true);
    });

    it('proceeds directly without dialog when both legal documents are configured', async () => {
      setupMocks({ privacyPolicyHtml: '<p>Policy</p>', termsAndConditionsHtml: '<p>Terms</p>' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      expect(result.current.isPublishWarningVisible).toBe(false);
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS));
    });
  });

  describe('handlePublishProceed', () => {
    it('patches visibility and navigates on success', async () => {
      setupMocks({ datasetVisibility: 'public' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('public'));
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'public' });
      expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });

    it('also updates entitlements when private and emails are present', async () => {
      setupMocks({ datasetVisibility: 'private' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('private'));
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'private' });
      expect(mockMutateAsync).toHaveBeenCalledWith({ 'user@example.com': ['preview', 'download'] });
    });

    it('updates entitlements with empty payload when private and no emails (revokes all access)', async () => {
      setupMocks({ datasetVisibility: 'private' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('private'));
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'private' });
      expect(mockMutateAsync).toHaveBeenCalledWith({});
    });

    it('does not update entitlements when public', async () => {
      setupMocks({ datasetVisibility: 'public' });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'public' });
    });

    it('closes the publish warning dialog', async () => {
      setupMocks();
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      await act(() => result.current.handlePublishProceed());
      expect(result.current.isPublishWarningVisible).toBe(false);
    });
  });

  describe('handlePublishCancel', () => {
    it('closes the publish warning dialog', async () => {
      setupMocks();
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await act(async () => result.current.handlePublish());
      act(() => result.current.handlePublishCancel());
      expect(result.current.isPublishWarningVisible).toBe(false);
    });
  });

  describe('handleCancel', () => {
    it('navigates to the datasets list', () => {
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleCancel());
      expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });
  });
});
