import { render, screen } from '@testing-library/react';
import { useParams } from 'react-router';
import { DatasetsMappingsStep } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';
import { useDataset } from 'hooks/useDatasets';
import { GISDataType } from 'types/backend';

jest.mock('react-router', () => ({
  useParams: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({
  useDataset: jest.fn(),
}));

jest.mock('../../../src/pages/AdminPortal/DatasetsMappingsStep/DefaultMappingsStep', () => ({
  DefaultMappingsStep: ({ id }: { id?: string }) => <div data-testid="sh-default-mappings-step" data-id={id} />,
}));

jest.mock('../../../src/pages/AdminPortal/DatasetsMappingsStep/RasterMappingsStep', () => ({
  RasterMappingsStep: ({ id }: { id?: string }) => <div data-testid="sh-raster-mappings-step" data-id={id} />,
}));

describe('DatasetsMappingsStep', () => {
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ id: '1' });
  });

  it('shows a loader while the dataset is loading', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<DatasetsMappingsStep />);
    expect(screen.queryByTestId('sh-default-mappings-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-raster-mappings-step')).not.toBeInTheDocument();
  });

  it('shows a loader when the dataset has not loaded yet even if isLoading is false', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    render(<DatasetsMappingsStep />);
    expect(screen.queryByTestId('sh-default-mappings-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-raster-mappings-step')).not.toBeInTheDocument();
  });

  it('renders RasterMappingsStep with the dataset id when gis_datatype is raster', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: { gis_datatype: GISDataType.RASTER }, isLoading: false });
    render(<DatasetsMappingsStep />);
    expect(screen.getByTestId('sh-raster-mappings-step')).toHaveAttribute('data-id', '1');
    expect(screen.queryByTestId('sh-default-mappings-step')).not.toBeInTheDocument();
  });

  it('renders DefaultMappingsStep with the dataset id when gis_datatype is point', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: { gis_datatype: GISDataType.POINT }, isLoading: false });
    render(<DatasetsMappingsStep />);
    expect(screen.getByTestId('sh-default-mappings-step')).toHaveAttribute('data-id', '1');
    expect(screen.queryByTestId('sh-raster-mappings-step')).not.toBeInTheDocument();
  });

  it('renders DefaultMappingsStep when gis_datatype is missing', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: {}, isLoading: false });
    render(<DatasetsMappingsStep />);
    expect(screen.getByTestId('sh-default-mappings-step')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-raster-mappings-step')).not.toBeInTheDocument();
  });
});
