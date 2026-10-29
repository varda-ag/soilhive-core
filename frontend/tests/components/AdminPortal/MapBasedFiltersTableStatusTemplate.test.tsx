import { render, screen, fireEvent } from '@testing-library/react';
import { MapBasedFiltersTableStatusTemplate } from 'components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTableStatusTemplate/MapBasedFiltersTableStatusTemplate';
import type { RasterFilterCategory } from 'types/backend';

jest.mock('components/UI', () => ({
  Tag: ({ text, className }: any) => (
    <span data-testid="mock-tag" className={className}>
      {text}
    </span>
  ),
  ToggleButton: ({ checked, disabled, onChange }: any) => (
    <button data-testid="mock-toggle-button" data-checked={String(checked)} disabled={disabled} onClick={() => onChange(!checked)} />
  ),
}));

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

describe('MapBasedFiltersTableStatusTemplate', () => {
  const onSetCategoryActive = jest.fn();

  afterEach(() => jest.clearAllMocks());

  describe('when the filter is not installed', () => {
    it('renders the Not installed tag', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ enabled: false })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      expect(screen.getByTestId('mock-tag')).toHaveTextContent('Not installed');
    });

    it('does not render the toggle', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ enabled: false })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      expect(screen.queryByTestId('mock-toggle-button')).not.toBeInTheDocument();
    });
  });

  describe('when the filter is installed', () => {
    it('renders the toggle and no tag', () => {
      render(<MapBasedFiltersTableStatusTemplate filter={makeFilter()} isActivationPending={false} onSetCategoryActive={onSetCategoryActive} />);

      expect(screen.getByTestId('mock-toggle-button')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-tag')).not.toBeInTheDocument();
    });

    it('shows an unchecked toggle and the Activate label for an inactive filter', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ active: false })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      expect(screen.getByTestId('mock-toggle-button')).toHaveAttribute('data-checked', 'false');
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });

    it('shows a checked toggle and the Deactivate label for an active filter', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ active: true })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      expect(screen.getByTestId('mock-toggle-button')).toHaveAttribute('data-checked', 'true');
      expect(screen.getByText('Deactivate')).toBeInTheDocument();
    });

    it('calls onSetCategoryActive with the filter id and true when an inactive filter is toggled', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ active: false })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      fireEvent.click(screen.getByTestId('mock-toggle-button'));

      expect(onSetCategoryActive).toHaveBeenCalledWith('land_cover', true);
    });

    it('calls onSetCategoryActive with the filter id and false when an active filter is toggled', () => {
      render(
        <MapBasedFiltersTableStatusTemplate
          filter={makeFilter({ active: true })}
          isActivationPending={false}
          onSetCategoryActive={onSetCategoryActive}
        />,
      );

      fireEvent.click(screen.getByTestId('mock-toggle-button'));

      expect(onSetCategoryActive).toHaveBeenCalledWith('land_cover', false);
    });

    it('disables the toggle while an activation is pending', () => {
      render(<MapBasedFiltersTableStatusTemplate filter={makeFilter()} isActivationPending onSetCategoryActive={onSetCategoryActive} />);

      expect(screen.getByTestId('mock-toggle-button')).toBeDisabled();
    });

    it('enables the toggle when no activation is pending', () => {
      render(<MapBasedFiltersTableStatusTemplate filter={makeFilter()} isActivationPending={false} onSetCategoryActive={onSetCategoryActive} />);

      expect(screen.getByTestId('mock-toggle-button')).not.toBeDisabled();
    });
  });
});
