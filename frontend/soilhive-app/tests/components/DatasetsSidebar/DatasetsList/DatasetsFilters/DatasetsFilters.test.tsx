import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsFilters } from 'components/DatasetsSidebar/DatasetsList/DatasetsFilters/DatasetsFilters';

jest.mock('components/UI', () => ({
  __esModule: true,
  TextInput: ({ value, onChange, placeholder }: any) => (
    <input data-testid="mock-textinput" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  ),
}));

describe('DatasetsFilters', () => {
  it('renders component', () => {
    const { container } = render(<DatasetsFilters />);

    expect(container).toMatchSnapshot();
  });

  it('search input updates value', () => {
    render(<DatasetsFilters />);

    const input = screen.getByTestId('mock-textinput');

    fireEvent.change(input, { target: { value: 'soil' } });
    expect(input).toHaveValue('soil');
  });
});
