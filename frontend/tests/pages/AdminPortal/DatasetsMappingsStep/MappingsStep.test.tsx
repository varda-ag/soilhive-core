import { render, screen } from '@testing-library/react';
import { MappingsStep } from 'pages/AdminPortal/DatasetsMappingsStep/MappingsStep';

jest.mock('pages/AdminPortal/DatasetsMappingsStep/MappingsBanner', () => ({
  MappingsBanner: ({ isRaster }: { isRaster?: boolean }) => <div data-testid="sh-mappings-banner" data-israster={String(!!isRaster)} />,
}));

function defaultProps(overrides?: Partial<React.ComponentProps<typeof MappingsStep>>) {
  return {
    datasetName: 'Mock-dataset',
    title: 'Map fields',
    subtitle: 'Map your fields to standard concepts and units',
    docsLink: 'https://docs.example.com',
    isRaster: false,
    mappedCount: 0,
    unmappedCount: 0,
    isContinueEnabled: false,
    onPrevious: jest.fn(),
    onSaveAndContinueLater: jest.fn(),
    onContinue: jest.fn(),
    children: <div data-testid="sh-mappings-table-slot" />,
    ...overrides,
  };
}

describe('MappingsStep', () => {
  it('renders the title and subtitle', () => {
    render(<MappingsStep {...defaultProps()} />);
    expect(screen.getByText('Map fields')).toBeInTheDocument();
    expect(screen.getByText('Map your fields to standard concepts and units')).toBeInTheDocument();
  });

  it('passes isRaster through to the banner', () => {
    render(<MappingsStep {...defaultProps({ isRaster: true })} />);
    expect(screen.getByTestId('sh-mappings-banner')).toHaveAttribute('data-israster', 'true');
  });

  it('renders children (the table slot)', () => {
    render(<MappingsStep {...defaultProps()} />);
    expect(screen.getByTestId('sh-mappings-table-slot')).toBeInTheDocument();
  });

  describe('messages', () => {
    it('renders no message when messages is omitted', () => {
      render(<MappingsStep {...defaultProps()} />);
      expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    });

    it('filters out null entries and renders only the non-null messages', () => {
      render(
        <MappingsStep
          {...defaultProps({
            messages: [null, { type: 'warning', message: 'No geometry was detected.' }, null],
          })}
        />,
      );
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(1);
      expect(screen.getByText('No geometry was detected.')).toBeInTheDocument();
    });

    it('renders multiple messages when more than one is non-null', () => {
      render(
        <MappingsStep
          {...defaultProps({
            messages: [
              { type: 'info', message: 'Geometry was automatically detected.' },
              { type: 'warning', message: "The 'depth' field cannot be used together with 'min depth' or 'max depth'." },
            ],
          })}
        />,
      );
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(2);
    });
  });

  describe('action buttons', () => {
    it('disables continue when isContinueEnabled is false', () => {
      render(<MappingsStep {...defaultProps({ isContinueEnabled: false })} />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
    });

    it('enables continue when isContinueEnabled is true', () => {
      render(<MappingsStep {...defaultProps({ isContinueEnabled: true })} />);
      expect(screen.getByTestId('sh-mappings-continue')).not.toBeDisabled();
    });

    it('defaults isSaveEnabled to true when omitted (e.g. the raster variant)', () => {
      render(<MappingsStep {...defaultProps()} />);
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });

    it('disables save-and-continue-later when isSaveEnabled is explicitly false (the default variant rule)', () => {
      render(<MappingsStep {...defaultProps({ isSaveEnabled: false })} />);
      expect(screen.getByTestId('sh-mappings-save-later')).toBeDisabled();
    });
  });
});
