import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTabNavigation } from 'components/UI/MobileTabNavigation/MobileTabNavigation';

const MockIcon = () => <svg data-testid="mock-icon" />;

const mockConfig = [
  { id: 'tab1', name: 'Tab 1', Icon: MockIcon },
  { id: 'tab2', name: 'Tab 2' },
  { id: 'tab3', name: 'Tab 3', Icon: MockIcon },
];

describe('MobileTabNavigation component', () => {
  it('renders all tabs', () => {
    const { container } = render(<MobileTabNavigation config={mockConfig} active="tab1" onChange={() => {}} />);

    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByText('Tab 3')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
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
});
