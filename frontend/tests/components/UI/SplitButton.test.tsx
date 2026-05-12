import { render, screen, fireEvent } from '@testing-library/react';

import { SplitButton, type SplitButtonOption } from 'components/UI/SplitButton/SplitButton';

const buildOptions = (overrides?: Partial<SplitButtonOption>[]): SplitButtonOption[] => [
  { code: 'export', name: 'Export', onSelect: jest.fn(), ...(overrides?.[0] ?? {}) },
  { code: 'share', name: 'Share', onSelect: jest.fn(), ...(overrides?.[1] ?? {}) },
  { code: 'archive', name: 'Archive', onSelect: jest.fn(), isDisabled: true, ...(overrides?.[2] ?? {}) },
];

describe('SplitButton Component', () => {
  it('renders main button content and chevron toggle, popover hidden by default', () => {
    render(<SplitButton options={buildOptions()}>Run</SplitButton>);

    expect(screen.getByTestId('sh-ui-splitbutton-main')).toHaveTextContent('Run');
    const toggle = screen.getByTestId('sh-ui-splitbutton-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('applies size class', () => {
    render(
      <SplitButton size="tiny" options={buildOptions()}>
        Run
      </SplitButton>,
    );

    expect(screen.getByTestId('sh-ui-splitbutton')).toHaveClass('Tiny');
  });

  it('applies custom className and dataTestId', () => {
    render(
      <SplitButton options={buildOptions()} className="custom-class" dataTestId="my-split">
        Run
      </SplitButton>,
    );

    const wrapper = screen.getByTestId('my-split');
    expect(wrapper).toHaveClass('custom-class');
  });

  it('main click without onMainClick toggles the popover', () => {
    render(<SplitButton options={buildOptions()}>Run</SplitButton>);

    const main = screen.getByTestId('sh-ui-splitbutton-main');
    fireEvent.click(main);
    expect(screen.getByTestId('sh-ui-splitbutton-popover')).toBeInTheDocument();

    fireEvent.click(main);
    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('main click with onMainClick invokes the callback and does not open the popover', () => {
    const onMainClick = jest.fn();

    render(
      <SplitButton options={buildOptions()} onMainClick={onMainClick}>
        Run
      </SplitButton>,
    );

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-main'));

    expect(onMainClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('chevron toggle opens and closes the popover and flips aria-expanded', () => {
    render(<SplitButton options={buildOptions()}>Run</SplitButton>);

    const toggle = screen.getByTestId('sh-ui-splitbutton-toggle');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const popover = screen.getByTestId('sh-ui-splitbutton-popover');
    expect(popover).toHaveAttribute('role', 'menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('clicking an option triggers its onSelect and closes the popover', () => {
    const onSelect = jest.fn();
    const options: SplitButtonOption[] = [
      { code: 'export', name: 'Export', onSelect },
      { code: 'share', name: 'Share', onSelect: jest.fn() },
    ];

    render(<SplitButton options={options}>Run</SplitButton>);

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    fireEvent.click(screen.getByText('Export'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('clicking a disabled option does not fire onSelect and keeps popover open', () => {
    const disabledOnSelect = jest.fn();
    const options: SplitButtonOption[] = [
      { code: 'archive', name: 'Archive', onSelect: disabledOnSelect, isDisabled: true },
      { code: 'share', name: 'Share', onSelect: jest.fn() },
    ];

    render(<SplitButton options={options}>Run</SplitButton>);

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    fireEvent.click(screen.getByText('Archive'));

    expect(disabledOnSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('sh-ui-splitbutton-popover')).toBeInTheDocument();
  });

  it('outside mousedown closes the popover', () => {
    render(<SplitButton options={buildOptions()}>Run</SplitButton>);

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    expect(screen.getByTestId('sh-ui-splitbutton-popover')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });

  it('Escape keydown closes the popover', () => {
    render(<SplitButton options={buildOptions()}>Run</SplitButton>);

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    expect(screen.getByTestId('sh-ui-splitbutton-popover')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
  });
});
