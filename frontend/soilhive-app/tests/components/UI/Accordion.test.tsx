import { render, screen, fireEvent } from '@testing-library/react';
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

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('opens when openedFromStart=true', () => {
    render(
      <Accordion title="Open" openedFromStart={true}>
        <div>Visible content</div>
      </Accordion>,
    );

    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('toggles open/close on click', () => {
    render(
      <Accordion title="Toggle me">
        <div>Toggle content</div>
      </Accordion>,
    );

    const header = screen.getByRole('button');

    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByText('Toggle content')).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();
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

  it('adds the Opened class when expanded', () => {
    render(
      <Accordion title="Check opened">
        <div>Content</div>
      </Accordion>,
    );

    const header = screen.getByRole('button');
    fireEvent.click(header);

    const accordion = screen.getByTestId('sh-ui-accordion');
    expect(accordion).toHaveClass('Opened');
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

    expect(container.querySelector('.SelectionPills ')).not.toBeInTheDocument();
  });
});
