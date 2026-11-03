import { render } from '@testing-library/react';
import { FilterBandDropdown } from 'components/AdminPortal/RasterFilterForm/FilterBandDropdown/FilterBandDropdown';

let capturedDropdownProps: any = {};

// The shared mock does not interpolate, so the options are checked by key and values
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

jest.mock('components/UI', () => ({
  Dropdown: (props: any) => {
    capturedDropdownProps = props;
    return <div data-testid="mock-dropdown" />;
  },
}));

const bands = [
  { band_number: 1, data_type: 'Byte' },
  { band_number: 2, data_type: 'UInt16' },
  { band_number: 3, data_type: 'Byte' },
];

describe('FilterBandDropdown', () => {
  const onChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedDropdownProps = {};
  });

  it('offers one option per band with its data type', () => {
    render(<FilterBandDropdown bands={bands} value={null} onChange={onChange} />);

    expect(capturedDropdownProps.options).toEqual([
      { code: '1', name: 'createFilter.band.option {"number":1,"dataType":"Byte"}' },
      { code: '2', name: 'createFilter.band.option {"number":2,"dataType":"UInt16"}' },
      { code: '3', name: 'createFilter.band.option {"number":3,"dataType":"Byte"}' },
    ]);
  });

  it('renders a small required field with its label, placeholder and hint', () => {
    render(<FilterBandDropdown bands={bands} value={null} onChange={onChange} />);

    expect(capturedDropdownProps).toEqual(
      expect.objectContaining({
        size: 'small',
        label: 'createFilter.band.label',
        placeholder: 'createFilter.band.placeholder',
        helperMessage: 'createFilter.band.hint {"count":3}',
        isRequired: true,
      }),
    );
  });

  it('has no value until a band is picked', () => {
    render(<FilterBandDropdown bands={bands} value={null} onChange={onChange} />);

    expect(capturedDropdownProps.value).toBeUndefined();
  });

  it('shows the picked band', () => {
    render(<FilterBandDropdown bands={bands} value={2} onChange={onChange} />);

    expect(capturedDropdownProps.value).toBe('2');
  });

  it('reports the picked band as a number', () => {
    render(<FilterBandDropdown bands={bands} value={null} onChange={onChange} />);

    capturedDropdownProps.onChange('3');

    expect(onChange).toHaveBeenCalledWith(3);
  });
});
