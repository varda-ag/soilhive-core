import { render, screen } from '@testing-library/react';
import { Tag } from 'components/UI/Tag/Tag';

describe('Tag component', () => {
  it('renders default type', () => {
    const { container } = render(<Tag text="Default Tag" />);
    expect(screen.getByTestId('sh-ui-tag')).toHaveTextContent('Default Tag');

    expect(container.firstChild).toHaveClass('Tag');
    expect(container.firstChild).toHaveClass('Default');
    expect(container).toMatchSnapshot();
  });

  it('applies custom className', () => {
    render(<Tag text="Custom" className="my-class" />);

    expect(screen.getByTestId('sh-ui-tag')).toHaveClass('my-class');
  });

  it('renders primary type', () => {
    const { container } = render(<Tag text="Primary Tag" type="primary" />);
    expect(screen.getByTestId('sh-ui-tag')).toHaveTextContent('Primary Tag');

    expect(container.firstChild).toHaveClass('Tag');
    expect(container.firstChild).toHaveClass('Primary');
    expect(container).toMatchSnapshot();
  });
});
