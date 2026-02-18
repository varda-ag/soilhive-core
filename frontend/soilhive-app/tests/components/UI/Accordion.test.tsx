import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { AccordionRef } from 'types/components';
import { Accordion } from 'components/UI/Accordion/Accordion';

describe('Accordion component', () => {
  it('renders with title and is closed by default', () => {
    const { container } = render(
      <Accordion title="My Accordion">
        <div>Content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toBeInTheDocument();
    expect(accordion).not.toHaveClass('Opened');
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('opens when openedFromStart=true', () => {
    render(
      <Accordion title="Open" openedFromStart={true}>
        <div>Visible content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toHaveClass('Opened');
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('toggles open/close on click', () => {
    const onToggle = jest.fn();

    render(
      <Accordion title="Toggle me" onToggle={onToggle}>
        <div>Toggle content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    const header = screen.getByRole('button');

    expect(accordion).not.toHaveClass('Opened');

    fireEvent.click(header);
    expect(accordion).toHaveClass('Opened');
    expect(onToggle).toHaveBeenCalledWith(true);

    fireEvent.click(header);
    expect(accordion).not.toHaveClass('Opened');
    expect(onToggle).toHaveBeenCalledWith(false);

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('applies the correct type class (primary)', () => {
    render(
      <Accordion title="Primary accordion" type="primary">
        <div>Content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toHaveClass('Primary');
  });

  it('applies the correct type class (secondary)', () => {
    render(
      <Accordion title="Secondary accordion" type="secondary">
        <div>Content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toHaveClass('Secondary');
  });

  it('applies the correct type class (tertiary)', () => {
    render(
      <Accordion title="Tertiary accordion" type="tertiary">
        <div>Content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toHaveClass('Tertiary');
  });

  it('renders pillSlot when provided', () => {
    render(
      <Accordion title="With Pills" pillsSlot={<div data-testid="pills">Pills content</div>}>
        <div>Content</div>
      </Accordion>,
    );

    expect(screen.getByTestId('pills')).toBeInTheDocument();
    expect(screen.getByText('Pills content')).toBeInTheDocument();
  });

  it('does not render PillsContainer when PillsSlot undefined', () => {
    const { container } = render(
      <Accordion title="No Pills">
        <div>Content</div>
      </Accordion>,
    );

    expect(container.querySelector('.SelectionPills')).not.toBeInTheDocument();
  });

  it('renders Icon when provided', () => {
    const TestIcon = (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="icon" {...props} />;

    render(
      <Accordion title="With Icon" type="tertiary" Icon={TestIcon}>
        <div>Content</div>
      </Accordion>,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('supports imperative ref expand/collapse', () => {
    const ref = React.createRef<AccordionRef>();

    render(
      <Accordion ref={ref} title="Imperative">
        <div>Content</div>
      </Accordion>,
    );

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).not.toHaveClass('Opened');

    act(() => {
      ref.current?.expand();
    });

    expect(accordion).toHaveClass('Opened');

    act(() => {
      ref.current?.collapse();
    });
    expect(accordion).not.toHaveClass('Opened');
  });
});
