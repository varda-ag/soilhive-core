import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTabNavigation } from 'components/UI/MobileTabNavigation/MobileTabNavigation';

const MockIcon = () => <svg data-testid="mock-icon" />;

const mockConfig = [
  { id: 'tab1', name: 'Tab 1', Icon: MockIcon },
  { id: 'tab2', name: 'Tab 2' },
  { id: 'tab3', name: 'Tab 3', Icon: MockIcon },
];

describe('MobileTabNavigation component', () => {
  it('renders all tabs with primary styles by default', () => {
    const { container } = render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveClass('Primary');
    expect(container).toMatchSnapshot();
  });

  it('renders secondary type tabs', () => {
    render(<MobileTabNavigation config={mockConfig} type="secondary" active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveClass('Secondary');
  });

  it('accepts additional className', () => {
    render(<MobileTabNavigation config={mockConfig} className="testClass" active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveClass('testClass');
  });

  it('renders icons when provided', () => {
    render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getAllByTestId('mock-icon')).toHaveLength(2);
  });

  it('applies Active class to the active tab', () => {
    render(<MobileTabNavigation config={mockConfig} active="tab2" onChange={() => {}} />);

    const tabItems = screen.getAllByTestId('sh-ui-mobile-tab-navigation-item');

    expect(tabItems[1]).toHaveClass('Active');
    expect(tabItems[0]).not.toHaveClass('Active');
    expect(tabItems[2]).not.toHaveClass('Active');
  });

  it('calls onChange with correct id when a tab is clicked', () => {
    const onChange = jest.fn();
    render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={onChange} />);

    fireEvent.click(screen.getByText('Tab 2'));

    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('applies default xs font size as CSS variable', () => {
    render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveStyle({
      '--tab-font-size': 'var(--font-size-xs)',
    });
  });

  it('applies custom font size as CSS variable', () => {
    render(<MobileTabNavigation config={mockConfig} fontSize="sm" active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveStyle({
      '--tab-font-size': 'var(--font-size-sm)',
    });
  });

  it('applies default 0.25rem gap as CSS variable', () => {
    render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveStyle({
      '--tab-item-gap': '0',
    });
  });

  it('applies custom gap as CSS variable', () => {
    render(<MobileTabNavigation config={mockConfig} gap="8px" active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveStyle({
      '--tab-item-gap': '8px',
    });
  });

  it('applies Scrollable class when scrollable=true', () => {
    render(<MobileTabNavigation config={mockConfig} scrollable active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).toHaveClass('Scrollable');
  });

  it('does not apply Scrollable class when scrollable is omitted', () => {
    render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getByTestId('sh-ui-mobile-tab-navigation')).not.toHaveClass('Scrollable');
  });
});
