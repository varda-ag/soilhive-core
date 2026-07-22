import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetsSettings } from 'hooks/useDatasetsSettings';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { useDataset } from 'hooks/useDatasets';
import { useDatasetEntitlements, useDatasetEntitlementsMutation } from 'hooks/useDatasetEntitlements';
import { useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
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
  useUpdateDatasetMutation: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fullyFilledDataset = {
  visibility: 'public',
  name: 'Test Dataset',
  full_name: 'Test Dataset Full Name',
  version: '1.0',
  author: 'Test Author',
  description: 'A description',
  spatial_resolution: '250m',
  publication_date: '2021-06-01',
  citation: 'Test citation',
  reference_period_start: '2020-01-01',
  reference_period_stop: '2020-12-31',
  gis_datatype: 'raster',
  licenses: ['lic-1'],
  measured_properties: [{ slug: 'ph' }],
  soil_depth: { min: 0, max: 30 },
};

function setupMocks({
  authMode = 'oidc',
  dataset = { visibility: 'public' } as any,
  entitlements = {},
  privacyPolicyHtml = '',
  termsAndConditionsHtml = '',
} = {}) {
  (useAuthContext as jest.Mock).mockReturnValue({ authMode });
  (useDataset as jest.Mock).mockReturnValue({ data: dataset, isLoading: false });
  (useDatasetEntitlements as jest.Mock).mockReturnValue({ data: entitlements, isLoading: false });
  (useUpdateDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  (useDatasetEntitlementsMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  (useTheme as jest.Mock).mockReturnValue({ themeConfig: { privacyPolicyHtml, termsAndConditionsHtml } });
}

describe('useDatasetsSettings', () => {
  beforeEach(() => setupMocks());
  afterEach(() => jest.clearAllMocks());

  it('initialises visibility from dataset API response', async () => {
    setupMocks({ dataset: { visibility: 'public' } });
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
    it('patches visibility and status=PUBLISHED and navigates on success', async () => {
      setupMocks({ dataset: { visibility: 'public', publication_date: '2026-07-09' } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('public'));
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'public', status: 'PUBLISHED' });
      expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });

    it('also updates entitlements when private and emails are present', async () => {
      setupMocks({ dataset: { visibility: 'private', publication_date: '2026-07-09' } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('private'));
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'private', status: 'PUBLISHED' });
      expect(mockMutateAsync).toHaveBeenCalledWith({ 'user@example.com': ['preview', 'download'] });
    });

    it('updates entitlements with empty payload when private and no emails (revokes all access)', async () => {
      setupMocks({ dataset: { visibility: 'private', publication_date: '2026-07-09' } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      await waitFor(() => expect(result.current.visibility).toBe('private'));
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'private', status: 'PUBLISHED' });
      expect(mockMutateAsync).toHaveBeenCalledWith({});
    });

    it('does not update entitlements when public', async () => {
      setupMocks({ dataset: { visibility: 'public', publication_date: '2026-07-09' } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      act(() => result.current.handleEmailChange('user@example.com'));
      act(() => result.current.handleAddEmail());
      await act(() => result.current.handlePublishProceed());
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutateAsync).toHaveBeenCalledWith({ visibility: 'public', status: 'PUBLISHED' });
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

  describe('hasMandatoryMetadata', () => {
    it('is true when all mandatory fields are present', () => {
      setupMocks({ dataset: fullyFilledDataset });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(true);
    });

    it('is false when a mandatory text field is missing', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, author: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when version is missing', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, version: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when citation is missing', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, citation: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when reference_period_start is missing', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, reference_period_start: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when reference_period_stop is missing', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, reference_period_stop: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when reference period fields are missing even if inferred', () => {
      setupMocks({
        dataset: {
          ...fullyFilledDataset,
          reference_period_start: null,
          reference_period_stop: null,
          inferred_properties: ['reference_period_start', 'reference_period_stop'],
        },
      });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when soil_depth is missing even if inferred', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, soil_depth: null, inferred_properties: ['soil_depth'] } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when licenses is empty even if inferred', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, licenses: [], inferred_properties: ['licenses'] } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when spatial_resolution is missing for a raster dataset', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, gis_datatype: 'raster', spatial_resolution: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is true when spatial_resolution is missing for a non-raster dataset', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, gis_datatype: 'point', spatial_resolution: null } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(true);
    });

    it('is false when licenses array is empty', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, licenses: [] } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when measured_properties is empty', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, measured_properties: [] } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when soil_depth min is null', () => {
      setupMocks({ dataset: { ...fullyFilledDataset, soil_depth: { min: null, max: 30 } } });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });

    it('is false when dataset is null', () => {
      setupMocks({ dataset: null });
      const { result } = renderHook(() => useDatasetsSettings('dataset-123'), { wrapper: queryClientWrapper });
      expect(result.current.hasMandatoryMetadata).toBe(false);
    });
  });
});
