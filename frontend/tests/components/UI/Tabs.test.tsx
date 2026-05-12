import { fireEvent, render, screen } from '@testing-library/react';
import { Tabs } from 'components/UI/Tabs/Tabs';

describe('Tabs', () => {
  const mockOnChange = jest.fn();
  const tabsData = [
    { value: 'logo', label: 'Logo' },
    { value: 'colors', label: 'Colors' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Tabs and matches snapshot', () => {
    const { container } = render(<Tabs tabsData={tabsData} activeTab="logo" onChange={mockOnChange} />);

    expect(screen.getByTestId('sh-ui-tabs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Colors' })).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('applies active class to the active tab only', () => {
    render(<Tabs tabsData={tabsData} activeTab="colors" onChange={mockOnChange} />);

    expect(screen.getByRole('button', { name: 'Logo' })).not.toHaveClass('TabActive');
    expect(screen.getByRole('button', { name: 'Colors' })).toHaveClass('TabActive');
  });

  it('accepts additional className', () => {
    render(<Tabs tabsData={tabsData} activeTab="logo" className="CustomTabs" onChange={mockOnChange} />);

    expect(screen.getByTestId('sh-ui-tabs')).toHaveClass('Tabs');
    expect(screen.getByTestId('sh-ui-tabs')).toHaveClass('CustomTabs');
  });

  it('calls onChange with clicked tab value', () => {
    render(<Tabs tabsData={tabsData} activeTab="logo" onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Colors' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith('colors');
  });
});
