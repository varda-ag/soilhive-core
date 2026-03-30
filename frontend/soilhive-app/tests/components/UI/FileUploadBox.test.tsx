import { createRef, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileUploadBox } from 'components/UI/FileUploadBox/FileUploadBox';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
}));

const UseDropAreaMock = jest.fn();

jest.mock('react-use/lib/useDropArea', () => ({
  __esModule: true,
  default: (...args: unknown[]) => UseDropAreaMock(...args),
}));

jest.mock('components/UI/ProgressBar/ProgressBar', () => ({
  ProgressBar: ({ progress }: { progress: number[] }) => <div data-testid="progress-bar">{progress.join(',')}</div>,
}));

jest.mock('components/UI/FormMessage/FormMessage', () => ({
  FormMessage: ({ message, type }: { message: string; type: string }) => (
    <div data-testid="form-message">
      {type}:{message}
    </div>
  ),
}));

describe('FileUploadBox', () => {
  const mockHandleFiles = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    UseDropAreaMock.mockReturnValue([{}]);
  });

  it('renders empty state and matches snapshot', () => {
    const { container } = render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" />);

    expect(screen.getByTestId('sh-ui-fileuploadbox')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-fileuploadbox-droparea')).toBeInTheDocument();
    expect(screen.getByTestId('svg-icon-mock')).toBeInTheDocument();

    expect(screen.getByText('components.file_upload_box.title')).toBeInTheDocument();
    expect(screen.getByText('Upload your file')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('renders uploading state for files', () => {
    const files = [new File(['a'], 'first.csv', { type: 'text/csv' }), new File(['b'], 'second.csv', { type: 'text/csv' })];

    render(
      <FileUploadBox
        handleFiles={mockHandleFiles}
        caption="Upload your file"
        files={files}
        uploadProgress={{ 'first.csv': [10, 20], 'second.csv': [50] }}
      />,
    );

    expect(screen.getByText('components.file_upload_box.uploading: first.csv')).toBeInTheDocument();
    expect(screen.getByText('components.file_upload_box.uploading: second.csv')).toBeInTheDocument();

    const progressBars = screen.getAllByTestId('progress-bar');
    expect(progressBars).toHaveLength(2);
    expect(progressBars[0]).toHaveTextContent('10,20');
    expect(progressBars[1]).toHaveTextContent('50');
  });

  it('passes empty progress array when file progress is missing', () => {
    const files = [new File(['a'], 'first.csv', { type: 'text/csv' })];

    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" files={files} uploadProgress={{}} />);

    expect(screen.getByTestId('progress-bar')).toHaveTextContent('');
  });

  it('calls handleFiles on input change', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" />);

    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['test'], 'file.csv', { type: 'text/csv' });

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    expect(mockHandleFiles).toHaveBeenCalledTimes(1);
    expect(mockHandleFiles.mock.calls[0][0]).toEqual([file]);
  });

  it('disables file input when disabled=true', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" disabled />);

    expect(screen.getByTestId('upload-input')).toBeDisabled();
  });

  it('sets multiple=true by default', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" />);

    expect(screen.getByTestId('upload-input')).toHaveAttribute('multiple');
  });

  it('sets multiple=false for single file upload', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" isSingleFileUpload={true} />);

    expect(screen.getByTestId('upload-input')).not.toHaveAttribute('multiple');
  });

  it('renders error message', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" errorMessage="Upload failed" />);

    expect(screen.getByTestId('form-message')).toHaveTextContent('error:Upload failed');
  });

  it('does not render error message when errorMessage is empty', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" errorMessage={null} />);

    expect(screen.queryByTestId('form-message')).not.toBeInTheDocument();
  });

  it('passes fileInputRef to input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" fileInputRef={ref as RefObject<HTMLInputElement>} />);

    expect(ref.current).toBe(screen.getByTestId('upload-input'));
  });

  it('initializes useDropArea with onFiles handler', () => {
    render(<FileUploadBox handleFiles={mockHandleFiles} caption="Upload your file" />);

    expect(UseDropAreaMock).toHaveBeenCalledTimes(1);

    const firstCallArg = UseDropAreaMock.mock.calls[0][0];
    expect(firstCallArg).toEqual(
      expect.objectContaining({
        onFiles: expect.any(Function),
      }),
    );

    const droppedFiles = [new File(['a'], 'dropped.csv', { type: 'text/csv' })];
    firstCallArg.onFiles(droppedFiles);

    expect(mockHandleFiles).toHaveBeenCalledWith(droppedFiles);
  });
});
