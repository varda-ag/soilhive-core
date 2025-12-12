import { render, screen, fireEvent } from '@testing-library/react';
import {
  AvailabilityMobileNavigation,
  AVAILABILITY_MOBILE_TABS,
} from 'components/AvailabilityMobileNavigation/AvailabilityMobileNavigation';

jest.mock('react-router');
describe('AvailabilityMobileNavigation component', () => {
  it('renders all three mobile navigation tabs', () => {
    const { container } = render(<AvailabilityMobileNavigation active={AVAILABILITY_MOBILE_TABS.MAP} onChange={() => {}} />);

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();

    expect(screen.getByText('Map')).toHaveClass('Active');
    expect(container).toMatchSnapshot();
  });

  it('renders icons properly', () => {
    render(<AvailabilityMobileNavigation active={AVAILABILITY_MOBILE_TABS.MAP} onChange={() => {}} />);

    expect(screen.getAllByTestId('svg-icon-mock')).toHaveLength(3);
  });

  it('calls onChange when clicking a tab', () => {
    const handleChange = jest.fn();

    render(<AvailabilityMobileNavigation active={AVAILABILITY_MOBILE_TABS.MAP} onChange={handleChange} />);

    fireEvent.click(screen.getByText('Filters'));

    expect(handleChange).toHaveBeenCalledWith('filters');
  });
});
