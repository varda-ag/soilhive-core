import { render } from '@testing-library/react';
import { DocumentationLink } from 'components/AdminPortal/DocumentationLink/DocumentationLink';

describe('DocumentationLink', () => {
  it('matches the snapshot', () => {
    const { container } = render(<DocumentationLink href="https://docs.example.com" />);
    expect(container).toMatchSnapshot();
  });
});
