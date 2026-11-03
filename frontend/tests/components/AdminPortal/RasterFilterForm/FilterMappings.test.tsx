import { render, screen, fireEvent } from '@testing-library/react';
import { FilterMappings } from 'components/AdminPortal/RasterFilterForm/FilterMappings/FilterMappings';

const rows = [
  { pixelValue: '1', label: 'Water' },
  { pixelValue: '2', label: '' },
];

describe('FilterMappings', () => {
  const onLabelChange = jest.fn();
  const onClear = jest.fn();

  const renderMappings = () => render(<FilterMappings rows={rows} onLabelChange={onLabelChange} onClear={onClear} />);

  // Each row renders the pixel value input, then the label input
  const pixelValueInputs = () => screen.getAllByTestId('sh-ui-textinputfield').filter((_, i) => i % 2 === 0);
  const labelInputs = () => screen.getAllByTestId('sh-ui-textinputfield').filter((_, i) => i % 2 === 1);

  afterEach(() => jest.clearAllMocks());

  it('renders the unlabelled values hint', () => {
    renderMappings();

    expect(screen.getByText('Values left unlabelled won’t appear in the filters panel')).toBeInTheDocument();
  });

  it('renders the column headers', () => {
    renderMappings();

    expect(screen.getByText('Pixel value')).toBeInTheDocument();
    expect(screen.getByText('Label shown to the users in the filter panel')).toBeInTheDocument();
  });

  it('renders one row per pixel value', () => {
    renderMappings();

    expect(pixelValueInputs()).toHaveLength(2);
    expect(screen.getAllByTestId('sh-filter-mapping-clear')).toHaveLength(2);
  });

  it('renders the pixel values as disabled inputs', () => {
    renderMappings();

    expect(pixelValueInputs().map(input => (input as HTMLInputElement).value)).toEqual(['1', '2']);
    pixelValueInputs().forEach(input => expect(input).toBeDisabled());
  });

  it('renders the labels as editable inputs', () => {
    renderMappings();

    expect(labelInputs().map(input => (input as HTMLInputElement).value)).toEqual(['Water', '']);
    labelInputs().forEach(input => expect(input).toBeEnabled());
  });

  it('calls onLabelChange with the pixel value and the typed label', () => {
    renderMappings();

    fireEvent.change(labelInputs()[1], { target: { value: 'Trees' } });

    expect(onLabelChange).toHaveBeenCalledWith('2', 'Trees');
  });

  it('calls onClear with the pixel value of the row whose clear button is clicked', () => {
    renderMappings();

    fireEvent.click(screen.getAllByTestId('sh-filter-mapping-clear')[0]);

    expect(onClear).toHaveBeenCalledWith('1');
    expect(onLabelChange).not.toHaveBeenCalled();
  });

  it('renders an empty table without rows', () => {
    render(<FilterMappings rows={[]} onLabelChange={onLabelChange} onClear={onClear} />);

    expect(screen.queryAllByTestId('sh-ui-textinputfield')).toHaveLength(0);
  });
});
