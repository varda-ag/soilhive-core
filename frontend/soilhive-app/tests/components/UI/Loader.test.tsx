import { render } from '@testing-library/react';
import { Loader } from 'components/UI/Loader/Loader';

describe('Loader component', () => {
  it('renders the overlay and spinner elements and matches snapshot', () => {
    const { container } = render(<Loader />);

    expect(container.firstChild).toHaveClass('LoaderOverlay');
    expect(container.firstChild?.firstChild).toHaveClass('Loader');
    expect(container).toMatchSnapshot();
  });
});
