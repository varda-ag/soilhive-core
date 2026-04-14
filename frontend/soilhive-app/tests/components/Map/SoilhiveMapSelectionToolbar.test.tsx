import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveMapSelectionToolbar from 'components/Map/SoilhiveMapSelectionToolbar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SoilhiveMapSelectionToolbar', () => {
  const onCancel = jest.fn();
  const onReset = jest.fn();

  beforeEach(() => {
    onCancel.mockClear();
    onReset.mockClear();
  });

  describe('default mode (no mode prop)', () => {
    it('defaults to drawing mode', () => {
      const { container } = render(<SoilhiveMapSelectionToolbar onCancel={onCancel} onReset={onReset} />);

      expect(screen.getByText('map_selection_toolbar.reset')).toBeInTheDocument();
      expect(screen.getByText('map_selection_toolbar.cancel')).toBeInTheDocument();
      expect(container.querySelector('.drawing')).toBeInTheDocument();
    });
  });

  describe('drawing mode', () => {
    it('renders reset and cancel buttons', () => {
      const { container } = render(<SoilhiveMapSelectionToolbar mode="drawing" onCancel={onCancel} onReset={onReset} />);

      expect(screen.getByText('map_selection_toolbar.reset')).toBeInTheDocument();
      expect(screen.getByText('map_selection_toolbar.cancel')).toBeInTheDocument();
      expect(container.querySelector('.drawing')).toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('calls onReset when reset button is clicked', () => {
      render(<SoilhiveMapSelectionToolbar mode="drawing" onCancel={onCancel} onReset={onReset} />);

      fireEvent.click(screen.getByText('map_selection_toolbar.reset'));

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when cancel button is clicked', () => {
      render(<SoilhiveMapSelectionToolbar mode="drawing" onCancel={onCancel} onReset={onReset} />);

      fireEvent.click(screen.getByText('map_selection_toolbar.cancel'));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onReset).not.toHaveBeenCalled();
    });

    it('does not render clear or search buttons', () => {
      render(<SoilhiveMapSelectionToolbar mode="drawing" onCancel={onCancel} onReset={onReset} />);

      expect(screen.queryByText('map_selection_toolbar.clear_selection')).not.toBeInTheDocument();
      expect(screen.queryByText('map_selection_toolbar.search_this_area')).not.toBeInTheDocument();
    });
  });

  describe('clear mode', () => {
    it('renders clear selection button', () => {
      const { container } = render(<SoilhiveMapSelectionToolbar mode="clear" onCancel={onCancel} onReset={onReset} />);

      expect(screen.getByText('map_selection_toolbar.clear_selection')).toBeInTheDocument();
      expect(container.querySelector('.clear-button')).toBeInTheDocument();
      expect(container.querySelector('.drawing')).not.toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('calls onCancel when clear selection button is clicked', () => {
      render(<SoilhiveMapSelectionToolbar mode="clear" onCancel={onCancel} onReset={onReset} />);

      fireEvent.click(screen.getByText('map_selection_toolbar.clear_selection'));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not render drawing or search buttons', () => {
      render(<SoilhiveMapSelectionToolbar mode="clear" onCancel={onCancel} onReset={onReset} />);

      expect(screen.queryByText('map_selection_toolbar.reset')).not.toBeInTheDocument();
      expect(screen.queryByText('map_selection_toolbar.cancel')).not.toBeInTheDocument();
      expect(screen.queryByText('map_selection_toolbar.search_this_area')).not.toBeInTheDocument();
    });
  });

  describe('search mode', () => {
    it('renders search this area button', () => {
      const { container } = render(<SoilhiveMapSelectionToolbar mode="search" onCancel={onCancel} onReset={onReset} />);

      expect(screen.getByText('map_selection_toolbar.search_this_area')).toBeInTheDocument();
      expect(container.querySelector('.search-area-button')).toBeInTheDocument();
      expect(container.querySelector('.drawing')).not.toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('calls onCancel when search this area button is clicked', () => {
      render(<SoilhiveMapSelectionToolbar mode="search" onCancel={onCancel} onReset={onReset} />);

      fireEvent.click(screen.getByText('map_selection_toolbar.search_this_area'));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not render drawing or clear buttons', () => {
      render(<SoilhiveMapSelectionToolbar mode="search" onCancel={onCancel} onReset={onReset} />);

      expect(screen.queryByText('map_selection_toolbar.reset')).not.toBeInTheDocument();
      expect(screen.queryByText('map_selection_toolbar.cancel')).not.toBeInTheDocument();
      expect(screen.queryByText('map_selection_toolbar.clear_selection')).not.toBeInTheDocument();
    });
  });
});
