import { render, screen } from '@testing-library/react';
import { MappingsBanner } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/MappingsBanner';

describe('MappingsBanner', () => {
  it('renders the mapped and unmapped counts', () => {
    render(<MappingsBanner mappedCount={3} unmappedCount={2} />);
    expect(screen.getByText('3 Mapped')).toBeInTheDocument();
    expect(screen.getByText('2 Unmapped')).toBeInTheDocument();
  });

  it('shows the columns warning when isRaster is omitted', () => {
    render(<MappingsBanner mappedCount={0} unmappedCount={1} />);
    expect(screen.getByText("Unmapped columns won't be loaded in the platform")).toBeInTheDocument();
  });

  it('shows the columns warning when isRaster is false', () => {
    render(<MappingsBanner mappedCount={0} unmappedCount={1} isRaster={false} />);
    expect(screen.getByText("Unmapped columns won't be loaded in the platform")).toBeInTheDocument();
  });

  it('shows the layers warning when isRaster is true', () => {
    render(<MappingsBanner mappedCount={0} unmappedCount={1} isRaster />);
    expect(screen.getByText('Unmapped layers won’t be loaded in the platform')).toBeInTheDocument();
  });
});
