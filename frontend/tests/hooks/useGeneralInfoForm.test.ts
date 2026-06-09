import { renderHook, act } from '@testing-library/react';
import { useGeneralInfoForm } from 'hooks/useGeneralInfoForm';
import { useCreateDatasetMutation, useUpdateDatasetMutation } from 'hooks/useDatasetMutation';
import { useDataset } from 'hooks/useDatasets';
import useIngestionFlow from 'hooks/useIngestionFlow';

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../src/App', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));
jest.mock('hooks/useDatasetMutation', () => ({
  useCreateDatasetMutation: jest.fn(),
  useUpdateDatasetMutation: jest.fn(),
}));
jest.mock('hooks/useIngestionFlow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockMarkAsChanged = jest.fn();
const mockResetChanges = jest.fn();

const validationMessages = {
  name: 'Name is required',
  full_name: 'Full name is required',
  description: 'Description is required',
  author: 'Author is required',
};

const mockDataset = { id: 'abc', name: 'DS1', full_name: 'Dataset 1', description: 'Desc', author: 'Author' };

describe('useGeneralInfoForm', () => {
  beforeEach(() => {
    (useDataset as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useCreateDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(mockDataset), isPending: false });
    (useUpdateDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(mockDataset), isPending: false });
    (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges });
  });

  afterEach(() => jest.clearAllMocks());

  it('initialises with empty form when no dataset', () => {
    const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
    expect(result.current.formData).toEqual({ name: '', full_name: '', description: '', author: '' });
  });

  it('populates form from fetched dataset', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: mockDataset, isLoading: false });
    const { result } = renderHook(() => useGeneralInfoForm('abc', validationMessages));
    expect(result.current.formData.name).toBe('DS1');
  });

  it('sets validation errors when required fields are empty', async () => {
    const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
    await act(() => result.current.handleContinue());
    expect(result.current.errors.name).toBe('Name is required');
    expect(result.current.errors.author).toBe('Author is required');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('calls createDataset and navigates to soil-data on Continue with valid form', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(mockDataset);
    (useCreateDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });

    const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
    act(() => result.current.handleChange('name', 'DS1'));
    act(() => result.current.handleChange('full_name', 'Dataset 1'));
    act(() => result.current.handleChange('description', 'Desc'));
    act(() => result.current.handleChange('author', 'Author'));

    await act(() => result.current.handleContinue());

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('soil-data'));
  });

  it('calls updateDataset and navigates to datasets list on SaveAndContinueLater', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(mockDataset);
    (useUpdateDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useDataset as jest.Mock).mockReturnValue({ data: mockDataset, isLoading: false });

    const { result } = renderHook(() => useGeneralInfoForm('abc', validationMessages));
    await act(() => result.current.handleSaveAndContinueLater());

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('datasets'));
  });

  describe('leave Ingestion flow', () => {
    it('handleChange calls markAsChanged', () => {
      const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
      act(() => result.current.handleChange('name', 'test'));
      expect(mockMarkAsChanged).toHaveBeenCalledTimes(1);
    });

    it('handleContinue calls resetChanges when form is valid', async () => {
      const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
      act(() => result.current.handleChange('name', 'DS1'));
      act(() => result.current.handleChange('full_name', 'Dataset 1'));
      act(() => result.current.handleChange('description', 'Desc'));
      act(() => result.current.handleChange('author', 'Author'));
      await act(() => result.current.handleContinue());
      expect(mockResetChanges).toHaveBeenCalledTimes(1);
    });

    it('handleContinue does not call resetChanges when validation fails', async () => {
      const { result } = renderHook(() => useGeneralInfoForm(undefined, validationMessages));
      await act(() => result.current.handleContinue());
      expect(mockResetChanges).not.toHaveBeenCalled();
    });

    it('handleSaveAndContinueLater calls resetChanges', async () => {
      (useDataset as jest.Mock).mockReturnValue({ data: mockDataset, isLoading: false });
      const { result } = renderHook(() => useGeneralInfoForm('abc', validationMessages));
      await act(() => result.current.handleSaveAndContinueLater());
      expect(mockResetChanges).toHaveBeenCalledTimes(1);
    });
  });
});
