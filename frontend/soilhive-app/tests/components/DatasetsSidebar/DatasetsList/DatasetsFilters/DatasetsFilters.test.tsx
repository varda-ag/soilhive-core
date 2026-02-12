import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsFilters } from 'components/DatasetsSidebar/DatasetsList/DatasetsFilters/DatasetsFilters';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI', () => ({
  __esModule: true,
  TextInput: ({ value, onChange, placeholder }: any) => (
    <input data-testid="mock-textinput" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  ),
}));

describe('DatasetsFilters', () => {
  const mockSetSearchValue = jest.fn();

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      searchValue: '',
      setSearchValue: mockSetSearchValue,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders component', () => {
    const { container } = render(<DatasetsFilters />);

    expect(container).toMatchSnapshot();
  });

  it('search input updates searchValue', () => {
    render(<DatasetsFilters />);

    const input = screen.getByTestId('mock-textinput');

    fireEvent.change(input, { target: { value: 'soil' } });
    expect(mockSetSearchValue).toHaveBeenCalledWith('soil');
  });
});
