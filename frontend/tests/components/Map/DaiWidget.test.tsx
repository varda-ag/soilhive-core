import { render, screen, fireEvent } from '@testing-library/react';
import { DaiWidget } from 'components/Map/DaiWidget/DaiWidget';
import { __setIsDesktopLayout, __resetIsDesktopLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('components/UI/ToggleButton/ToggleButton', () => ({
  ToggleButton: ({ checked, onChange }: any) => (
    <button data-testid="toggle-button" data-checked={String(checked)} onClick={() => onChange(!checked)} />
  ),
}));

jest.mock('components/UI/RangeSlider/RangeSlider', () => ({
  RangeSlider: ({ initialValue, onChange }: any) => (
    <input data-testid="range-slider" type="range" defaultValue={initialValue} onChange={e => onChange(Number(e.target.value))} />
  ),
}));

const defaultProps = {
  isEnabled: true,
  opacity: 80,
  isDefaultExpanded: true,
  onToggle: jest.fn(),
  onOpacityChange: jest.fn(),
};

describe('DaiWidget', () => {
  afterEach(() => {
    jest.clearAllMocks();
    __resetIsDesktopLayout();
  });

  describe('rendering', () => {
    beforeEach(() => __setIsDesktopLayout(true));

    it('renders the title', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.getByText('Coverage map')).toBeInTheDocument();
    });

    it('applies a custom className', () => {
      const { container } = render(<DaiWidget {...defaultProps} className="my-class" />);
      expect(container.firstChild).toHaveClass('my-class');
    });
  });

  describe('isLoading', () => {
    beforeEach(() => __setIsDesktopLayout(true));

    it('shows reload icon when isLoading is true', () => {
      render(<DaiWidget {...defaultProps} isLoading />);
      expect(screen.getByTestId('sh-reload-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('toggle-button')).not.toBeInTheDocument();
    });

    it('shows toggle button when isLoading is false', () => {
      render(<DaiWidget {...defaultProps} isLoading={false} />);
      expect(screen.getByTestId('toggle-button')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-reload-icon')).not.toBeInTheDocument();
    });

    it('shows toggle button when isLoading is omitted', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.getByTestId('toggle-button')).toBeInTheDocument();
    });
  });

  describe('ToggleButton', () => {
    beforeEach(() => __setIsDesktopLayout(true));

    it('reflects isEnabled prop', () => {
      render(<DaiWidget {...defaultProps} isEnabled={false} />);
      expect(screen.getByTestId('toggle-button')).toHaveAttribute('data-checked', 'false');
    });

    it('calls onToggle when clicked', () => {
      const onToggle = jest.fn();
      render(<DaiWidget {...defaultProps} onToggle={onToggle} />);
      fireEvent.click(screen.getByTestId('toggle-button'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('desktop layout', () => {
    beforeEach(() => __setIsDesktopLayout(true));

    it('renders the chevron button', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    });

    it('shows body when isDefaultExpanded is true', () => {
      render(<DaiWidget {...defaultProps} isDefaultExpanded />);
      expect(screen.getByText('Opacity')).toBeInTheDocument();
    });

    it('hides body when isDefaultExpanded is false', () => {
      render(<DaiWidget {...defaultProps} isDefaultExpanded={false} />);
      expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
    });

    it('toggles body on chevron click', () => {
      render(<DaiWidget {...defaultProps} isDefaultExpanded />);
      expect(screen.getByText('Opacity')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
      expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
    });

    it('changes chevron aria-label after collapse', () => {
      render(<DaiWidget {...defaultProps} isDefaultExpanded />);
      const btn = screen.getByRole('button', { name: 'Collapse' });
      fireEvent.click(btn);
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    });
  });

  describe('mobile layout', () => {
    beforeEach(() => __setIsDesktopLayout(false));

    it('does not render the chevron button', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.queryByRole('button', { name: /collapse|expand/i })).not.toBeInTheDocument();
    });

    it('shows body when isEnabled is true', () => {
      render(<DaiWidget {...defaultProps} isEnabled />);
      expect(screen.getByText('Opacity')).toBeInTheDocument();
    });

    it('hides body when isEnabled is false', () => {
      render(<DaiWidget {...defaultProps} isEnabled={false} />);
      expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
    });
  });

  describe('body content', () => {
    beforeEach(() => __setIsDesktopLayout(true));

    it('displays the current opacity value', () => {
      render(<DaiWidget {...defaultProps} opacity={65} />);
      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    it('calls onOpacityChange when slider changes', () => {
      const onOpacityChange = jest.fn();
      render(<DaiWidget {...defaultProps} onOpacityChange={onOpacityChange} />);
      fireEvent.change(screen.getByTestId('range-slider'), { target: { value: '50' } });
      expect(onOpacityChange).toHaveBeenCalledWith(50);
    });

    it('renders all 4 legend items', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.getByText('Very low')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('renders the FAQ link', () => {
      render(<DaiWidget {...defaultProps} />);
      expect(screen.getByText('Documentation about this map')).toBeInTheDocument();
    });
  });

  it('matches snapshot on desktop', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<DaiWidget {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot on mobile', () => {
    __setIsDesktopLayout(false);
    const { container } = render(<DaiWidget {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });
});
