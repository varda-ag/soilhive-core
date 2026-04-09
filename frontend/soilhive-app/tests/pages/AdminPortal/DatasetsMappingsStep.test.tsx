import { render } from '@testing-library/react';
import { DatasetsMappingsStep } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';

describe('DatasetsMappingsStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsMappingsStep />);
    expect(container).toMatchSnapshot();
  });
});
