import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MenuOption } from 'types/components';
import { Menu } from 'components/UI/Menu/Menu';

const baseOptions: MenuOption[] = [
  { code: '1', name: 'Option 1' },
  { code: '2', name: 'Option 2' },
  { code: '3', name: 'Option 3', isDisabled: true },
];

describe('Menu Component', () => {
  it('renders all options', () => {
    const { container } = render(<Menu options={baseOptions} onSelect={() => {}} />);

    expect(screen.getAllByTestId('sh-ui-menuoption')).toHaveLength(3);
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('applies size class', () => {
    render(<Menu size="tiny" options={baseOptions} onSelect={() => {}} />);

    const menu = screen.getByTestId('sh-ui-menu');
    expect(menu).toHaveClass('Tiny');
  });

  it('marks selected option when selectedOption is passed', () => {
    const { container } = render(<Menu options={baseOptions} selectedOptions={['2']} onSelect={() => {}} showSelectedCheckIcon />);

    const secondOption = screen.getAllByTestId('sh-ui-menuoption')[1];
    expect(secondOption).toHaveClass('Selected');
    expect(container.querySelector('.CheckIcon')).toBeInTheDocument();
  });

  it('disabled option cannot be clicked', () => {
    const onSelect = jest.fn();

    render(<Menu options={baseOptions} onSelect={onSelect} />);

    const disabled = screen.getAllByTestId('sh-ui-menuoption')[2];
    fireEvent.click(disabled);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking an option triggers onSelect', () => {
    const onSelect = jest.fn();

    render(<Menu options={baseOptions} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Option 1'));

    expect(onSelect).toHaveBeenCalledWith(['1']);
  });

  it('keepSelection = true updates internal state', () => {
    const onSelect = jest.fn();

    render(<Menu options={baseOptions} onSelect={onSelect} keepSelection showSelectedCheckIcon />);

    fireEvent.click(screen.getByText('Option 2'));

    expect(onSelect).toHaveBeenCalledWith(['2']);

    const second = screen.getAllByTestId('sh-ui-menuoption')[1];
    expect(second).toHaveClass('Selected');
  });

  it('keepSelection = false does NOT update internal state', () => {
    render(<Menu options={baseOptions} onSelect={() => {}} keepSelection={false} />);

    fireEvent.click(screen.getByText('Option 2'));

    const options = screen.getAllByTestId('sh-ui-menuoption');
    options.forEach(opt => {
      expect(opt).not.toHaveClass('Selected');
    });
  });

  it('supports multiselect behaviour', () => {
    const onSelect = jest.fn();

    render(<Menu options={baseOptions} onSelect={onSelect} keepSelection showSelectedCheckIcon isMultiselect />);

    fireEvent.click(screen.getByText('Option 1'));
    fireEvent.click(screen.getByText('Option 2'));

    expect(onSelect).toHaveBeenCalledWith(['1', '2']);

    const first = screen.getAllByTestId('sh-ui-menuoption')[0];
    const second = screen.getAllByTestId('sh-ui-menuoption')[1];
    expect(first).toHaveClass('Selected');
    expect(second).toHaveClass('Selected');

    // Deselect first
    fireEvent.click(screen.getByText('Option 1'));
    expect(onSelect).toHaveBeenCalledWith(['2']);
    expect(first).not.toHaveClass('Selected');
  });

  it('handles incorrect selected options', () => {
    const onSelect = jest.fn();

    const { container } = render(
      <Menu options={baseOptions} onSelect={onSelect} selectedOptions={['unknown']} keepSelection showSelectedCheckIcon isMultiselect />,
    );

    expect(container.querySelector('.Selected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Option 1'));

    expect(onSelect).toHaveBeenCalledWith(['1']);
    expect(container.querySelector('.Selected')).toBeInTheDocument();
  });

  it('renders custom option icon when provided', () => {
    const TestIcon = () => <svg data-testid="test-icon" />;

    const optionsWithIcon: MenuOption[] = [{ code: '1', name: 'Option 1', Icon: TestIcon }];

    render(<Menu options={optionsWithIcon} onSelect={() => {}} />);

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('supports forwarded ref', () => {
    const ref = React.createRef<HTMLDivElement>();

    render(<Menu options={baseOptions} onSelect={() => {}} ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current instanceof HTMLDivElement).toBe(true);
  });
});
