import { render, screen, fireEvent } from '@testing-library/react';
import { MapBasedFiltersTableActionTemplate } from 'components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTableActionTemplate/MapBasedFiltersTableActionTemplate';
import type { RasterFilterCategory } from 'types/backend';

const makeFilter = (overrides?: Partial<RasterFilterCategory>): RasterFilterCategory => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: '',
  enabled: true,
  active: false,
  mappings: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  ...overrides,
});

describe('MapBasedFiltersTableActionTemplate', () => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();

  afterEach(() => jest.clearAllMocks());

  describe('when the filter is installed', () => {
    it('renders the edit and delete icons', () => {
      render(<MapBasedFiltersTableActionTemplate filter={makeFilter()} onEdit={onEdit} onDelete={onDelete} />);

      expect(screen.getByTestId('sh-filter-edit')).toBeInTheDocument();
      expect(screen.getByTestId('sh-filter-delete')).toBeInTheDocument();
    });

    it('calls onEdit with the filter id when the edit icon is clicked', () => {
      render(<MapBasedFiltersTableActionTemplate filter={makeFilter()} onEdit={onEdit} onDelete={onDelete} />);

      fireEvent.click(screen.getByTestId('sh-filter-edit'));

      expect(onEdit).toHaveBeenCalledWith('land_cover');
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('calls onDelete with the filter when the delete icon is clicked', () => {
      const filter = makeFilter();
      render(<MapBasedFiltersTableActionTemplate filter={filter} onEdit={onEdit} onDelete={onDelete} />);

      fireEvent.click(screen.getByTestId('sh-filter-delete'));

      expect(onDelete).toHaveBeenCalledWith(filter);
      expect(onEdit).not.toHaveBeenCalled();
    });
  });

  describe('when the filter is not installed', () => {
    it('renders no actions', () => {
      render(<MapBasedFiltersTableActionTemplate filter={makeFilter({ enabled: false })} onEdit={onEdit} onDelete={onDelete} />);

      expect(screen.queryByTestId('sh-filter-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-filter-delete')).not.toBeInTheDocument();
    });
  });
});
