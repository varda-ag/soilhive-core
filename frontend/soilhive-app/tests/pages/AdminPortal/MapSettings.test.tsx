import { render } from '@testing-library/react';
import { MapSettings } from '../../../src/pages/AdminPortal/MapSettings/MapSettings';

describe('MapSettings page', () => {
  it('matches snapshot', () => {
    const { container } = render(<MapSettings />);
    expect(container).toMatchSnapshot();
  });
});
