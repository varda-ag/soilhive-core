import { render, screen } from '@testing-library/react';
import { VardaFoundationAttribution } from 'components/VardaFoundationAttribution/VardaFoundationAttribution';

describe('VardaFoundationAttribution', () => {
  it('renders the translated attribution links and text', () => {
    const { container } = render(<VardaFoundationAttribution />);

    const vardaLink = screen.getByRole('link', { name: 'Varda Foundation' });
    expect(vardaLink).toHaveAttribute('href', 'https://www.varda.ag');
    expect(vardaLink).toHaveAttribute('target', '_blank');

    const openSourceLink = screen.getByRole('link', { name: 'open source' });
    expect(openSourceLink).toHaveAttribute('href', 'https://github.com/varda-ag/soilhive-core');
    expect(openSourceLink).toHaveAttribute('target', '_blank');

    expect(container).toHaveTextContent('infrastructure');
  });

  it('applies the component class and any custom className', () => {
    const { container } = render(<VardaFoundationAttribution className="custom-class" />);
    expect(container.firstChild).toHaveClass('VardaFoundationAttribution', 'custom-class');
    expect(container).toMatchSnapshot();
  });
});
