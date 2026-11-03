import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDescriptionForm } from 'components/AdminPortal/RasterFilterForm/FilterDescriptionForm/FilterDescriptionForm';
import { FILTER_DESCRIPTION_MAX_LENGTH } from 'hooks/useFilterForm';

describe('FilterDescriptionForm', () => {
  const onChange = jest.fn();

  const renderForm = (formData = { name: '', description: '' }) =>
    render(<FilterDescriptionForm formData={formData} onChange={onChange} />);

  const nameInput = () => screen.getByTestId('sh-ui-textinputfield') as HTMLInputElement;
  const descriptionInput = () => screen.getByTestId('sh-ui-textareafield') as HTMLTextAreaElement;

  afterEach(() => jest.clearAllMocks());

  it('renders the name and description labels', () => {
    renderForm();

    expect(screen.getByText('Filter name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('marks both fields as required', () => {
    renderForm();

    screen.getAllByTestId('sh-ui-label').forEach(label => expect(label).toHaveTextContent('*'));
    expect(screen.getAllByTestId('sh-ui-label')).toHaveLength(2);
  });

  it('renders the placeholders', () => {
    renderForm();

    expect(nameInput()).toHaveAttribute('placeholder', 'This name will appear in the filter panel');
    expect(descriptionInput()).toHaveAttribute('placeholder', 'Describe the filter usage');
  });

  it('renders the values of the form', () => {
    renderForm({ name: 'Land Cover 2024', description: 'Copernicus land cover' });

    expect(nameInput().value).toBe('Land Cover 2024');
    expect(descriptionInput().value).toBe('Copernicus land cover');
  });

  it('calls onChange with name when the name is typed', () => {
    renderForm();

    fireEvent.change(nameInput(), { target: { value: 'Land Cover 2024' } });

    expect(onChange).toHaveBeenCalledWith('name', 'Land Cover 2024');
  });

  it('calls onChange with description when the description is typed', () => {
    renderForm();

    fireEvent.change(descriptionInput(), { target: { value: 'Copernicus land cover' } });

    expect(onChange).toHaveBeenCalledWith('description', 'Copernicus land cover');
  });

  it('limits the description length', () => {
    renderForm();

    expect(descriptionInput()).toHaveAttribute('maxLength', String(FILTER_DESCRIPTION_MAX_LENGTH));
  });

  it('counts the symbols left in the description', () => {
    renderForm({ name: '', description: 'Copernicus' });

    expect(screen.getByTestId('sh-ui-textarea-counter')).toHaveTextContent(`${FILTER_DESCRIPTION_MAX_LENGTH - 10} symbols left`);
  });

  it('applies the description styles to the textarea wrapper', () => {
    renderForm();

    expect(screen.getByTestId('sh-ui-textarea')).toHaveClass('DescriptionTextArea');
  });
});
