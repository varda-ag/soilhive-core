import { act, render, screen } from '@testing-library/react';
import { AdditionalResourcesUpload } from 'pages/AdminPortal/DatasetsMappingsStep/AdditionalResourcesUpload/AdditionalResourcesUpload';
import { useAdditionalResourceUpload } from 'hooks/useAdditionalResourceUpload';
import { useApiQueries } from 'hooks/useApiQueries';
import { useStorageConfig } from 'hooks/useStorageConfig';

jest.mock('hooks/useApiQueries', () => ({
  useApiQueries: jest.fn(),
}));

jest.mock('hooks/useStorageConfig', () => ({
  useStorageConfig: jest.fn(),
}));

// The component only needs `handleFiles` and the captured `onFileUploaded` callback to exercise
// the accumulation bug — real XHR upload behavior is already covered by useAdditionalResourceUpload.test.ts.
jest.mock('hooks/useAdditionalResourceUpload', () => ({
  useAdditionalResourceUpload: jest.fn(),
  ADDITIONAL_RESOURCE_EXTENSIONS: ['.txt', '.pdf', '.doc', '.docx', '.tif', '.tiff'],
}));

describe('AdditionalResourcesUpload', () => {
  let capturedOnFileUploaded: (resource: { file_id: string; name: string }) => void;

  beforeEach(() => {
    (useApiQueries as jest.Mock).mockReturnValue([]);
    (useStorageConfig as jest.Mock).mockReturnValue({
      storageConfig: { storageMode: 'local', maxUploadSizeMB: 500 },
      isLoading: false,
      isError: false,
    });
    (useAdditionalResourceUpload as jest.Mock).mockImplementation(onFileUploaded => {
      capturedOnFileUploaded = onFileUploaded;
      return {
        fileInputRef: { current: null },
        uploadingFiles: [],
        uploadProgress: {},
        uploadErrors: [],
        handleFiles: jest.fn(),
      };
    });
  });

  it('keeps every uploaded file when onFileUploaded fires multiple times before a re-render', () => {
    const onChange = jest.fn();
    render(<AdditionalResourcesUpload value={[]} onChange={onChange} />);

    // Simulates several parallel uploads completing back-to-back, all before React re-renders
    // with an updated `value` prop — the exact scenario that used to drop all but the last file.
    act(() => {
      capturedOnFileUploaded({ file_id: 'file-1', name: 'a.csv' });
      capturedOnFileUploaded({ file_id: 'file-2', name: 'b.csv' });
      capturedOnFileUploaded({ file_id: 'file-3', name: 'c.csv' });
    });

    expect(onChange).toHaveBeenLastCalledWith([{ file_id: 'file-1' }, { file_id: 'file-2' }, { file_id: 'file-3' }]);
  });

  it('appends to the existing value prop rather than replacing it', () => {
    const onChange = jest.fn();
    render(<AdditionalResourcesUpload value={[{ file_id: 'existing' }]} onChange={onChange} />);

    act(() => {
      capturedOnFileUploaded({ file_id: 'new-file', name: 'a.csv' });
    });

    expect(onChange).toHaveBeenLastCalledWith([{ file_id: 'existing' }, { file_id: 'new-file' }]);
  });

  it('reflects a removal that happens synchronously alongside a completed upload', () => {
    const onChange = jest.fn();
    render(<AdditionalResourcesUpload value={[{ file_id: 'existing' }]} onChange={onChange} />);

    act(() => {
      screen.getByLabelText('Remove resource').click();
      capturedOnFileUploaded({ file_id: 'new-file', name: 'a.csv' });
    });

    expect(onChange).toHaveBeenLastCalledWith([{ file_id: 'new-file' }]);
  });

  it('removes a resource from the list when its remove button is clicked', () => {
    const onChange = jest.fn();
    render(<AdditionalResourcesUpload value={[{ file_id: 'file-1' }, { file_id: 'file-2' }]} onChange={onChange} />);

    screen.getAllByLabelText('Remove resource')[0].click();

    expect(onChange).toHaveBeenCalledWith([{ file_id: 'file-2' }]);
  });

  it('picks up an externally updated value prop across a re-render before accumulating further', () => {
    const onChange = jest.fn();
    const { rerender } = render(<AdditionalResourcesUpload value={[{ file_id: 'a' }]} onChange={onChange} />);

    // Simulates the parent committing an unrelated update to `value` (e.g. the state roundtrip
    // through useRasterMappingStep) between renders — the internal ref must catch up to it.
    rerender(<AdditionalResourcesUpload value={[{ file_id: 'a' }, { file_id: 'b' }]} onChange={onChange} />);

    act(() => {
      capturedOnFileUploaded({ file_id: 'c', name: 'c.csv' });
    });

    expect(onChange).toHaveBeenLastCalledWith([{ file_id: 'a' }, { file_id: 'b' }, { file_id: 'c' }]);
  });

  it('starts fresh after value is externally reset between renders', () => {
    const onChange = jest.fn();
    const { rerender } = render(<AdditionalResourcesUpload value={[{ file_id: 'a' }, { file_id: 'b' }]} onChange={onChange} />);

    rerender(<AdditionalResourcesUpload value={[]} onChange={onChange} />);

    act(() => {
      capturedOnFileUploaded({ file_id: 'new-file', name: 'x.csv' });
    });

    expect(onChange).toHaveBeenLastCalledWith([{ file_id: 'new-file' }]);
  });
});
