import { render, fireEvent } from '@testing-library/react';
import { DeleteCheckboxCell } from '../../../src/pages/AdminPortal/DatasetsPreviewStep/DeleteCheckboxCell';

const getCheckbox = () => document.querySelector('input[type="checkbox"]') as HTMLInputElement;

describe('DeleteCheckboxCell', () => {
  it('renders a checkbox when isInitiallyChecked is false', () => {
    render(<DeleteCheckboxCell recordId={1} isInitiallyChecked={false} toggleDeletion={() => {}} />);
    expect(getCheckbox()).toBeInTheDocument();
    expect(getCheckbox()).not.toBeChecked();
  });

  it('renders checked when isInitiallyChecked is true', () => {
    render(<DeleteCheckboxCell recordId={1} isInitiallyChecked={true} toggleDeletion={() => {}} />);
    expect(getCheckbox()).toBeChecked();
    fireEvent.click(getCheckbox());
    expect(getCheckbox()).not.toBeChecked();
  });

  it('calls toggleDeletion with recordId when clicked', () => {
    const toggleDeletion = jest.fn();
    render(<DeleteCheckboxCell recordId={42} isInitiallyChecked={false} toggleDeletion={toggleDeletion} />);
    fireEvent.click(getCheckbox());
    expect(toggleDeletion).toHaveBeenCalledTimes(1);
    expect(toggleDeletion).toHaveBeenCalledWith(42);
    expect(getCheckbox()).toBeChecked();
  });

  it('calls toggleDeletion on each click with the same recordId', () => {
    const toggleDeletion = jest.fn();
    render(<DeleteCheckboxCell recordId={7} isInitiallyChecked={false} toggleDeletion={toggleDeletion} />);
    fireEvent.click(getCheckbox());
    fireEvent.click(getCheckbox());
    expect(toggleDeletion).toHaveBeenCalledTimes(2);
    expect(toggleDeletion).toHaveBeenNthCalledWith(1, 7);
    expect(toggleDeletion).toHaveBeenNthCalledWith(2, 7);
  });
});
